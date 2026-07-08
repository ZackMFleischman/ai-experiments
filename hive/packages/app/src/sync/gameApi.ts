// Typed client wrappers for the DESIGN §5.3 callables (T4.6). The `callable`
// factory is @parlor/web's (shared across parlor games); hive's payloads
// (color + timeControlDays, uhpMove, offerDraw/respondDraw) stay here.
import { callable } from '@parlor/web/gameApi';
import type { Color, GameOptions } from '@hive/engine';

export const createGame = callable<
  { options: GameOptions; color: Color | 'random'; timeControlDays: 1 | 3 | 7 | null },
  { gameId: string; code: string }
>('createGame');

export const joinGame = callable<{ code: string }, { gameId: string }>('joinGame');
export const cancelGame = callable<{ gameId: string }, { ok: boolean }>('cancelGame');

export const challengeUser = callable<
  {
    opponentUid: string;
    options: GameOptions;
    color: Color | 'random';
    timeControlDays: 1 | 3 | 7 | null;
  },
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
