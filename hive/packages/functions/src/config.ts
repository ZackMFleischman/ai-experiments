// hive's GameServerConfig (DESIGN §5.3): the injection points @parlor/server's
// shared callables need — seat model, option validation, and the fresh game
// state. hive names its two seats by color: white = seat 0 (moves first),
// black = seat 1, so `result` and player maps key by 'white'/'black'. The
// engine's turn color ('w'/'b') is a SEPARATE namespace carried in `toMove`
// and set here via initialGame().fields, so parlor never has to know about it.
//
// createGame / joinGame / cancelGame / challengeUser / respondChallenge /
// rematch / resign are all @parlor/server shells over this config (index.ts).
// submitMove (engine) and offerDraw / respondDraw (draws are a hive concept)
// stay game-side in games.ts; so does the forfeit sweep (it reads the color
// toMove, not a seat key).
import { randomInt } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  IllegalMoveError,
  applyMove,
  deserializeState,
  initialState,
  parseUhp,
  result,
  serializeState,
  toUhp,
  type Color,
  type GameOptions,
} from '@hive/engine';
import type { GameServerConfig, InitialGame, SubmitMoveConfig } from '@parlor/server';
import { notifyConfig } from './notify';

/** Per-game options (DESIGN §5.2), pinned at creation. The four expansion
 * booleans are the engine's `GameOptions`; the async time control rides
 * alongside them so the whole choice travels in one `options` payload (parlor's
 * create shape). A meta concept, not an engine one — the app declares the
 * structurally identical client twin in sync/gameApi.ts. */
export interface HiveGameOptions extends GameOptions {
  timeControl: { days: 1 | 3 | 7 } | null;
}

export function parseOptions(raw: unknown): HiveGameOptions {
  const o = raw as Partial<Record<string, unknown>> | null;
  const keys = ['mosquito', 'ladybug', 'pillbug', 'tournamentOpening'] as const;
  if (!o || keys.some((k) => typeof o[k] !== 'boolean')) {
    throw new HttpsError('invalid-argument', 'malformed game options');
  }
  const tc = o['timeControl'];
  let timeControl: { days: 1 | 3 | 7 } | null = null;
  if (tc !== null && tc !== undefined) {
    const days = (tc as { days?: unknown }).days;
    if (days !== 1 && days !== 3 && days !== 7) {
      throw new HttpsError('invalid-argument', 'timeControl.days must be 1, 3 or 7');
    }
    timeControl = { days };
  }
  return {
    mosquito: o.mosquito as boolean,
    ladybug: o.ladybug as boolean,
    pillbug: o.pillbug as boolean,
    tournamentOpening: o.tournamentOpening as boolean,
    timeControl,
  };
}

/** Fresh game state: hive keeps the FULL serialized engine state on the doc
 * (perfect-information game — no hidden racks), plus the engine's turn fields.
 * Written by parlor's create/rematch under `...init.fields`, so `toMove: 'w'`
 * overrides parlor's seat-key default. `initialState` reads only the expansion
 * booleans; the extra timeControl field is ignored. */
function initialGame(options: HiveGameOptions): InitialGame {
  return {
    fields: {
      state: serializeState(initialState(options)),
      toMove: 'w',
      turn: 1,
    },
    subDocs: [],
  };
}

export const hiveServerConfig: GameServerConfig<HiveGameOptions> = {
  // white moves first (seat 0); result + player maps key by these.
  seatKeys: ['white', 'black'],
  parseOptions,
  parseSeatChoice(raw: unknown): 0 | 1 {
    // hive picks a COLOR; white = seat 0, black = seat 1.
    if (raw === 'w') return 0;
    if (raw === 'b') return 1;
    if (raw === 'random') return randomInt(2) === 0 ? 0 : 1;
    throw new HttpsError('invalid-argument', "color must be 'w' | 'b' | 'random'");
  },
  timeControlDays: (options) => options.timeControl?.days ?? null,
  initialGame,
  notify: notifyConfig,
};

// submitMove config for @parlor/server's createSubmitMove shell (Phase 2a). The
// shell owns auth / envelope / preconditions / moveCount + deadline bookkeeping
// / pendingDrawOffer clear / push; hive's `advance` is the only game-specific
// core — it runs the @hive/engine verdict pipeline over the full serialized
// state on the doc. hive's wire field stays `uhpMove` (TMove = the raw UHP
// string; the state-dependent parse happens inside the transaction, in advance).
export const hiveSubmitConfig: SubmitMoveConfig<HiveGameOptions, string> = {
  ...hiveServerConfig,
  parseMove(data: unknown): string {
    const uhpMove = (data as { uhpMove?: unknown })?.uhpMove;
    if (typeof uhpMove !== 'string') {
      throw new HttpsError('invalid-argument', 'expected {gameId, expectedMoveCount, uhpMove}');
    }
    return uhpMove;
  },
  advance({ doc, move: uhpMove, mySeat, caller, gameId }) {
    const d = doc as { players: { white: string | null; black: string | null }; state: string };
    const state = deserializeState(d.state);
    let next;
    let canonical: string;
    let kind: 'move' | 'pass';
    try {
      const move = parseUhp(uhpMove, state);
      canonical = toUhp(move, state);
      kind = move.type === 'pass' ? 'pass' : 'move';
      next = applyMove(state, move);
    } catch (err) {
      if (err instanceof IllegalMoveError || err instanceof Error) {
        throw new HttpsError('invalid-argument', `illegal move: ${(err as Error).message}`);
      }
      throw err;
    }

    const recipientUid = mySeat === 0 ? d.players.black : d.players.white;
    const outcome = result(next);
    const terminal =
      outcome.status === 'won'
        ? { result: outcome.winner === 'w' ? 'white' : 'black', endedBy: 'surround' }
        : outcome.status === 'draw'
          ? { result: 'draw', endedBy: outcome.by }
          : null;
    let recipientOutcome: string | null = null;
    if (terminal) {
      const recipientColor = mySeat === 0 ? 'black' : 'white';
      recipientOutcome =
        terminal.result === 'draw'
          ? 'Draw'
          : terminal.result === recipientColor
            ? 'You won!'
            : 'You lost';
    }

    return {
      moveDoc: { kind, uhp: canonical },
      gameFields: { state: serializeState(next), toMove: next.toMove as Color, turn: next.turn },
      terminal,
      push: {
        recipientUid,
        trigger: recipientOutcome ? 'game-over' : 'opponent-moved',
        args: {
          gameId,
          opponentName: caller.name,
          ...(recipientOutcome ? { outcome: recipientOutcome } : {}),
        },
      },
    };
  },
};
