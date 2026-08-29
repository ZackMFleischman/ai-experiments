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
//
// A game whose `invalidWords` setting is 'costs-turn' (§2.3) adds a fourth kind
// of outcome: a play the dictionary refuses is no longer an error, it is a
// PHONEY — a spent turn. Unlike an exchange, the WORDS it formed are recorded
// publicly (§3.3): the opponent is told what was tried, the same way an
// over-the-board challenge reveals a phoney before it is withdrawn. What stays
// secret is the rack — only the words the play actually formed are written, not
// the placements and not the tiles that never left the hand.
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
  rejectedWords,
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
import {
  SEAT_KEYS,
  bySeat,
  lexServerConfig,
  placingsOf,
  playedCopy,
  requireRuleset,
  shuffleFaces,
  withBag,
  phoneyCopy,
  type LexGameOptions,
} from './config';

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

export const lexSubmitConfig: SubmitMoveConfig<LexGameOptions, Move> = {
  ...lexServerConfig,
  parseMove(data: unknown): Move {
    return parseMove((data as { move?: unknown } | null)?.move);
  },
  async advance({ tx, gameRef, gameId, doc, move, mySeat, caller, expectedMoveCount }): Promise<AdvanceResult> {
    const d = doc as {
      players: Record<string, string | null>;
      options: LexGameOptions;
    };
    const seatKey = (seat: number): string => SEAT_KEYS[seat]!;
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
    const invalidWords = d.options.invalidWords ?? 'blocked';
    let next: GameState;
    let playRecord: { placements: unknown[]; words: unknown[]; score: number; bingo: boolean } | null =
      null;
    // 'costs-turn' games only: the play was legal geometry but a phoney.
    // applyMove has already spent the turn for it; these decide what is WRITTEN.
    let phoney = false;
    let phoneyWords: readonly string[] = [];
    try {
      if (move.type === 'play') {
        const scored = scorePlay(state.board, move.placements, ruleset);
        // The same stage-3 verdict applyMove is about to reach, asked here
        // because only the pre-move board can still be scored.
        const refused = rejectedWords(scored.words, dict);
        phoney = invalidWords === 'costs-turn' && refused.length > 0;
        if (phoney) phoneyWords = refused;
        if (!phoney) {
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
      }
      next = applyMove(state, move, dict, { invalidWords });
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

    const seatCount = next.racks.length;
    // The push goes to whoever moves NEXT — at two seats that is the other
    // player, exactly as before; T7.8 widens the game-over fan-out.
    const recipientSeat = next.toMove;
    const recipientUid = d.players[seatKey(recipientSeat)] ?? null;
    const outcome = gameResult(next);
    // Placings as seat keys (§6.2). `result` keeps its two-seat meaning — the
    // winning seat, or 'draw' when the top placing is shared.
    const standings = outcome.status === 'finished' ? placingsOf(outcome.standings) : null;
    const terminal =
      outcome.status === 'finished' && standings
        ? {
            result: standings[0]!.seats.length > 1 ? 'draw' : standings[0]!.seats[0]!,
            endedBy: outcome.by,
            standings,
          }
        : null;
    let recipientOutcome: string | null = null;
    if (terminal && standings) {
      const placing = standings.findIndex((tied) => tied.seats.includes(seatKey(recipientSeat)));
      recipientOutcome =
        terminal.result === 'draw'
          ? 'Draw'
          : placing === 0
            ? 'You won!'
            : seatCount > 2
              ? `You placed ${placing + 1} of ${seatCount}`
              : 'You lost';
    }
    let movedCopy: string | null = null;
    if (move.type === 'play' && playRecord) {
      const main = (playRecord.words[0] as { word?: string } | undefined)?.word ?? '';
      movedCopy = playedCopy(caller.name, main, playRecord.score);
    } else if (phoney) {
      movedCopy = phoneyCopy(caller.name, phoneyWords);
    }

    return {
      moveDoc: {
        // A phoney is its own kind, not a play with a zero — the sheet has to
        // say "turn lost". It records the WORDS it formed and nothing else: no
        // placements, no score, so the rack behind them stays secret (§3.3).
        kind: phoney ? 'phoney' : move.type,
        ...(phoney ? { phoney: { words: phoneyWords } } : {}),
        ...(playRecord ? { play: playRecord } : {}),
        // Privacy invariant (§3.3): the public log records HOW MANY tiles were
        // exchanged, never which.
        ...(move.type === 'exchange' ? { exchanged: move.tiles.length } : {}),
      },
      gameFields: {
        public: serializePublic(next),
        toMove: seatKey(next.toMove),
        scores: bySeat(seatCount, (seat) => next.scores[seat]!),
        bagCount: next.bag.length,
        rackCounts: bySeat(seatCount, (seat) => next.racks[seat]!.length),
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
