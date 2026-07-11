// Typed client wrappers for the callables: the cross-game surface comes
// from @parlor/web; submitMove (game-specific payload) uses the callable
// factory directly. TaflGameOptions is the client twin of the backend's —
// structurally identical; the emulator e2e exercises compatibility.
import { callable, createGameApi } from '@parlor/web/gameApi';
import type { SeatChoice, TaflGameOptions } from '../gameOptions';

const api = createGameApi<TaflGameOptions, SeatChoice>();

export const { createGame, joinGame, cancelGame, challengeUser, respondChallenge, resign, rematch } =
  api;

/** The typed JSON move on the wire — plain cell indices. */
export interface WireMove {
  from: number;
  to: number;
}

export const submitMove = callable<
  { gameId: string; expectedMoveCount: number; move: WireMove },
  { moveCount: number }
>('submitMove');
