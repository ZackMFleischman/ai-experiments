// Typed client wrappers for the DESIGN §5.3 callables (T4.6).
import { httpsCallable } from 'firebase/functions';
import type { Color, GameOptions } from '@hive/engine';
import { getFns } from './firebase';

function callable<Req, Res>(name: string): (data: Req) => Promise<Res> {
  return async (data) => {
    const fn = httpsCallable<Req, Res>(getFns(), name);
    const res = await fn(data);
    return res.data;
  };
}

export const createGame = callable<
  { options: GameOptions; color: Color | 'random' },
  { gameId: string; code: string }
>('createGame');

export const joinGame = callable<{ code: string }, { gameId: string }>('joinGame');

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
