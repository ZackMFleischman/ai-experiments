// Typed client wrappers for the DESIGN §5.3 callables (T4.6). The `callable`
// factory is @parlor/web's (shared across parlor games); the callables are
// @parlor/server shells (create/join/cancel/challenge/respond/rematch/resign)
// plus hive's own submitMove + draw offers. The create/challenge payloads match
// parlor's shape: the color choice rides `seat`, the time control rides inside
// `options` (HiveGameOptions — the structural twin of the functions' options).
import { callable } from '@parlor/web/gameApi';
import type { Color, GameOptions } from '@hive/engine';

export interface HiveGameOptions extends GameOptions {
  timeControl: { days: 1 | 3 | 7 } | null;
}

export const createGame = callable<
  { options: HiveGameOptions; seat: Color | 'random' },
  { gameId: string; code: string }
>('createGame');

export const joinGame = callable<{ code: string }, { gameId: string }>('joinGame');
export const cancelGame = callable<{ gameId: string }, { ok: boolean }>('cancelGame');

export const challengeUser = callable<
  { opponentUid: string; options: HiveGameOptions; seat: Color | 'random' },
  { gameId: string }
>('challengeUser');

export const respondChallenge = callable<{ gameId: string; accept: boolean }, { gameId: string }>(
  'respondChallenge',
);

export const submitMove = callable<
  { gameId: string; expectedMoveCount: number; uhpMove: string },
  { moveCount: number }
>('submitMove');

export const resign = callable<{ gameId: string }, { ok: boolean }>('resign');
export const offerDraw = callable<{ gameId: string }, { ok: boolean }>('offerDraw');
export const respondDraw = callable<{ gameId: string; accept: boolean }, { ok: boolean }>(
  'respondDraw',
);
export const rematch = callable<{ gameId: string }, { gameId: string }>('rematch');
