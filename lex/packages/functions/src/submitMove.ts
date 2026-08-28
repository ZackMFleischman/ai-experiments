// lex's submitMove config for @parlor/server's createSubmitMove shell (Phase 2a,
// DESIGN §6.3). The shell owns auth / the {gameId, expectedMoveCount} envelope /
// preconditions / moveCount + deadline bookkeeping / the pendingDrawOffer clear
// (a no-op for lex — it has no draw offers) / the opponent push. lex's `advance`
// is the game-specific core: it runs the full verdict pipeline (geometry + rack +
// dictionary) on the server with the same engine the client runs, against full
// state reconstructed from the server-private snapshot, and returns the move doc,
// the public game-doc fields, the caller's rack doc + the private bag doc as
// sub-writes, the terminal outcome, and the push. Exchange letters never reach a
// public doc — the log entry carries a count only, and the re-shuffled remainder
// is recorded as a private replay event (§3.3).
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { AdvanceResult, SubmitMoveConfig } from '@parlor/server';
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
import { lexServerConfig, playedCopy, requireRuleset, type LexGameOptions } from './config';

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

export const lexSubmitConfig: SubmitMoveConfig<LexGameOptions, Move> = {
  ...lexServerConfig,
  parseMove(data: unknown): Move {
    return parseMove((data as { move?: unknown } | null)?.move);
  },
  async advance({ tx, gameRef, gameId, doc, move, mySeat, caller, expectedMoveCount }): Promise<AdvanceResult> {
    const d = doc as {
      players: { p0: string | null; p1: string | null };
      options: LexGameOptions;
    };
    // Full state lives server-private only (§3.3): the snapshot in the bag doc,
    // regression-checked against public-log + events replay in tests.
    const bagRef = gameRef.collection('private').doc('bag');
    const bagDoc = await tx.get(bagRef);
    const priv = bagDoc.data() as { order: string; state: string } | undefined;
    if (!priv?.state) throw new HttpsError('internal', 'missing private state');
    const state = deserializeState(priv.state);
    const ruleset = requireRuleset(d.options.rulesetId);
    const dict = dictionary(d.options.dictionaryId);

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

    const recipientUid = mySeat === 0 ? d.players.p1 : d.players.p0;
    const outcome = gameResult(next);
    const terminal =
      outcome.status === 'finished'
        ? {
            // 2-seat wire form (T7.11 widens it to standings): the top
            // placing is a draw when more than one seat shares it.
            result: outcome.standings[0]!.length > 1 ? 'draw' : outcome.standings[0]![0] === 0 ? 'p0' : 'p1',
            endedBy: outcome.by,
          }
        : null;
    let recipientOutcome: string | null = null;
    if (terminal) {
      const recipientSeat = mySeat === 0 ? 'p1' : 'p0';
      recipientOutcome =
        terminal.result === 'draw'
          ? 'Draw'
          : terminal.result === recipientSeat
            ? 'You won!'
            : 'You lost';
    }
    let movedCopy: string | null = null;
    if (move.type === 'play' && playRecord) {
      const main = (playRecord.words[0] as { word?: string } | undefined)?.word ?? '';
      movedCopy = playedCopy(caller.name, main, playRecord.score);
    }

    return {
      moveDoc: {
        kind: move.type,
        ...(playRecord ? { play: playRecord } : {}),
        // Privacy invariant (§3.3): the public log records HOW MANY tiles were
        // exchanged, never which.
        ...(move.type === 'exchange' ? { exchanged: move.tiles.length } : {}),
      },
      gameFields: {
        public: serializePublic(next),
        toMove: next.toMove === 0 ? 'p0' : 'p1',
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
      },
      subWrites: [
        {
          path: ['racks', caller.uid],
          data: { tiles: next.racks[mySeat]!.join(''), n: expectedMoveCount + 1 },
        },
        {
          path: ['private', 'bag'],
          data: {
            state: serializeState(next),
            drawn: priv.order.length - next.bag.length,
            ...(event ? { events: FieldValue.arrayUnion(event) } : {}),
          },
          merge: true,
        },
      ],
      terminal,
      push: {
        recipientUid,
        trigger: recipientOutcome ? 'game-over' : 'opponent-moved',
        args: {
          gameId,
          opponentName: caller.name,
          ...(recipientOutcome
            ? { outcome: recipientOutcome }
            : movedCopy
              ? { outcome: movedCopy }
              : {}),
        },
      },
    };
  },
};
