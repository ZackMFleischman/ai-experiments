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
import { initialState, serializeState, type GameOptions } from '@hive/engine';
import type { GameServerConfig, InitialGame } from '@parlor/server';
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
