// submitMove (T4.5, DESIGN §6.3): the one game-specific callable. Runs the
// full verdict pipeline (geometry + rack + dictionary) on the server with the
// same engine the client runs, against full state reconstructed from the
// server-private snapshot; the move doc, game doc (public snapshot, counts,
// lastPlay, deadline), the caller's rack doc, and the private bag doc commit
// in ONE transaction; the opponent gets a push afterwards. Exchange letters
// never reach a public doc — the log entry carries a count only, and the
// re-shuffled remainder is recorded as a private replay event (§3.3).
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createNotify, deadlineFor, requireAuth } from '@parlor/server';
import {
  IllegalMoveError,
  applyMove,
  deserializeState,
  result as gameResult,
  scorePlay,
  serializePublic,
  serializeState,
  type Dictionary,
  type GameState,
  type Move,
  type Placement,
  type TileFace,
} from '@lex/engine';
import { loadDictionarySync } from '@lex/dict/node';
import { lexServerConfig, requireRuleset, type LexGameOptions } from './config';

const notify = createNotify(lexServerConfig.notify);

// The compiled DAWGs ship next to the bundle (lib/dict, scripts/dawgs.mjs).
const DICT_DIR = join(__dirname, 'dict');
const dictionaries = new Map<string, Dictionary>();
function dictionary(id: string): Dictionary {
  const cached = dictionaries.get(id);
  if (cached) return cached;
  const dict: Dictionary = loadDictionarySync(id, DICT_DIR);
  dictionaries.set(id, dict);
  return dict;
}

const FACE = /^[A-Z?]$/;
const LETTER = /^[A-Z]$/;

/** Validate the typed JSON move (§2.4) off the wire. */
function parseMove(raw: unknown): Move {
  const m = raw as { type?: unknown; placements?: unknown; tiles?: unknown } | null;
  if (!m || typeof m.type !== 'string') {
    throw new HttpsError('invalid-argument', 'malformed move');
  }
  if (m.type === 'pass') return { type: 'pass' };
  if (m.type === 'exchange') {
    if (
      !Array.isArray(m.tiles) ||
      m.tiles.length === 0 ||
      !m.tiles.every((t) => typeof t === 'string' && FACE.test(t))
    ) {
      throw new HttpsError('invalid-argument', 'exchange needs a non-empty tile list');
    }
    return { type: 'exchange', tiles: m.tiles as TileFace[] };
  }
  if (m.type === 'play') {
    if (!Array.isArray(m.placements) || m.placements.length === 0) {
      throw new HttpsError('invalid-argument', 'play needs placements');
    }
    const placements: Placement[] = m.placements.map((p) => {
      const c = p as { row?: unknown; col?: unknown; letter?: unknown; isBlank?: unknown };
      if (
        !Number.isInteger(c.row) ||
        !Number.isInteger(c.col) ||
        typeof c.letter !== 'string' ||
        !LETTER.test(c.letter) ||
        typeof c.isBlank !== 'boolean'
      ) {
        throw new HttpsError('invalid-argument', 'malformed placement');
      }
      return {
        cell: { row: c.row as number, col: c.col as number },
        letter: c.letter,
        isBlank: c.isBlank,
      };
    });
    return { type: 'play', placements };
  }
  throw new HttpsError('invalid-argument', `unknown move type '${m.type}'`);
}

/** Crypto Fisher-Yates over tile faces (server-side randomness, §3.3). */
function shuffleFaces(faces: readonly TileFace[]): TileFace[] {
  const out = [...faces];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** Same state with the bag remainder replaced (exchange re-shuffle) — via the
 * frozen serialize round-trip, so no private constructor is needed. */
function withBag(state: GameState, bag: readonly TileFace[]): GameState {
  const s = JSON.parse(serializeState(state)) as { bag: string };
  s.bag = bag.join('');
  return deserializeState(JSON.stringify(s));
}

interface SubmitData {
  gameId: string;
  expectedMoveCount: number;
  move: Move;
}

function parseSubmit(raw: unknown): SubmitData {
  const d = raw as { gameId?: unknown; expectedMoveCount?: unknown; move?: unknown } | null;
  if (typeof d?.gameId !== 'string' || typeof d?.expectedMoveCount !== 'number') {
    throw new HttpsError('invalid-argument', 'expected {gameId, expectedMoveCount, move}');
  }
  return {
    gameId: d.gameId,
    expectedMoveCount: d.expectedMoveCount,
    move: parseMove(d.move),
  };
}

export const submitMove = onCall(async (request) => {
  const caller = requireAuth(request);
  const { gameId, expectedMoveCount, move } = parseSubmit(request.data);

  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);
  const bagRef = gameRef.collection('private').doc('bag');

  let recipientUid: string | null = null;
  let recipientOutcome: string | null = null;
  let movedCopy: string | null = null;
  const moveCount = await db.runTransaction(async (tx) => {
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'game not found');
    const doc = game.data() as {
      status: string;
      players: { p0: string | null; p1: string | null };
      playerIds: string[];
      options: LexGameOptions;
      toMove: 'p0' | 'p1';
      moveCount: number;
      timeControl?: { days: number } | null;
    };
    if (!doc.playerIds.includes(caller.uid)) {
      throw new HttpsError('permission-denied', 'not a player in this game');
    }
    if (doc.status !== 'active') throw new HttpsError('failed-precondition', 'game is not active');
    if (doc.moveCount !== expectedMoveCount) {
      throw new HttpsError(
        'failed-precondition',
        `stale expectedMoveCount (game is at ${doc.moveCount})`,
      );
    }
    const mySeat = doc.players.p0 === caller.uid ? 0 : 1;
    if (doc.toMove !== (mySeat === 0 ? 'p0' : 'p1')) {
      throw new HttpsError('failed-precondition', 'not your turn');
    }

    // Full state lives server-private only (§3.3): the snapshot in the bag
    // doc, regression-checked against public-log + events replay in tests.
    const bagDoc = await tx.get(bagRef);
    const priv = bagDoc.data() as { order: string; state: string } | undefined;
    if (!priv?.state) throw new HttpsError('internal', 'missing private state');
    const state = deserializeState(priv.state);
    const ruleset = requireRuleset(doc.options.rulesetId);
    const dict = dictionary(doc.options.dictionaryId);

    // Score the play BEFORE applying (the log entry wants words + total);
    // applyMove reruns the full verdict pipeline and throws on any illegality.
    let next: GameState;
    let playRecord: { placements: unknown[]; words: unknown[]; score: number; bingo: boolean } | null =
      null;
    try {
      if (move.type === 'play') {
        const scored = scorePlay(state.board, move.placements, ruleset);
        playRecord = {
          placements: move.placements.map((p) => ({
            row: p.cell.row,
            col: p.cell.col,
            letter: p.letter,
            isBlank: p.isBlank,
          })),
          words: scored.words.map((w) => ({ word: w.word, score: w.score })),
          score: scored.total,
          bingo: scored.bingo,
        };
      }
      next = applyMove(state, move, dict);
    } catch (err) {
      if (err instanceof IllegalMoveError) {
        const words = err.words?.length ? ` (${err.words.join(', ')})` : '';
        throw new HttpsError('invalid-argument', `illegal move: ${err.message}${words}`);
      }
      if (err instanceof Error) {
        throw new HttpsError('invalid-argument', `illegal move: ${err.message}`);
      }
      throw err;
    }

    // Exchange: re-randomize the remainder server-side and record the private
    // replay event — the engine's own bag handling is deterministic (§3.3).
    let event: { n: number; returned: string; reshuffled: string } | null = null;
    if (move.type === 'exchange') {
      const reshuffled = shuffleFaces(next.bag);
      next = withBag(next, reshuffled);
      event = {
        n: expectedMoveCount,
        returned: move.tiles.join(''),
        reshuffled: reshuffled.join(''),
      };
    }

    recipientUid = mySeat === 0 ? doc.players.p1 : doc.players.p0;
    const outcome = gameResult(next);
    const terminal =
      outcome.status === 'finished'
        ? {
            status: 'finished',
            result: outcome.winner === 'draw' ? 'draw' : outcome.winner === 0 ? 'p0' : 'p1',
            endedBy: outcome.by,
          }
        : null;
    if (terminal) {
      const winnerSeat = terminal.result;
      const recipientSeat = mySeat === 0 ? 'p1' : 'p0';
      recipientOutcome =
        winnerSeat === 'draw' ? 'Draw' : winnerSeat === recipientSeat ? 'You won!' : 'You lost';
    }
    if (move.type === 'play' && playRecord) {
      const main = (playRecord.words[0] as { word?: string } | undefined)?.word ?? '';
      movedCopy = `${caller.name} played ${main} for ${playRecord.score} — your move.`;
    }

    tx.set(gameRef.collection('moves').doc(String(expectedMoveCount)), {
      n: expectedMoveCount,
      kind: move.type,
      ...(playRecord ? { play: playRecord } : {}),
      // Privacy invariant (§3.3): the public log records HOW MANY tiles were
      // exchanged, never which.
      ...(move.type === 'exchange' ? { exchanged: move.tiles.length } : {}),
      by: caller.uid,
      at: FieldValue.serverTimestamp(),
    });
    tx.update(gameRef, {
      public: serializePublic(next),
      toMove: next.toMove === 0 ? 'p0' : 'p1',
      moveCount: expectedMoveCount + 1,
      scores: { p0: next.scores[0], p1: next.scores[1] },
      bagCount: next.bag.length,
      rackCounts: { p0: next.racks[0]!.length, p1: next.racks[1]!.length },
      ...(playRecord
        ? {
            lastPlay: {
              by: caller.uid,
              word: (playRecord.words[0] as { word?: string } | undefined)?.word ?? '',
              score: playRecord.score,
            },
          }
        : { lastPlay: FieldValue.delete() }),
      deadlineAt: terminal ? null : deadlineFor(doc.timeControl ?? null),
      deadlineWarnedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(terminal ?? {}),
    });
    tx.set(gameRef.collection('racks').doc(caller.uid), {
      tiles: next.racks[mySeat]!.join(''),
      n: expectedMoveCount + 1, // current as of this move (client reconciliation)
    });
    tx.update(bagRef, {
      state: serializeState(next),
      drawn: priv.order.length - next.bag.length,
      ...(event ? { events: FieldValue.arrayUnion(event) } : {}),
    });
    return expectedMoveCount + 1;
  });

  await notify(db, recipientUid, recipientOutcome ? 'game-over' : 'opponent-moved', {
    gameId,
    opponentName: caller.name,
    ...(recipientOutcome ? { outcome: recipientOutcome } : movedCopy ? { outcome: movedCopy } : {}),
  });
  return { moveCount };
});
