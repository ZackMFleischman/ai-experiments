// Typed client wrappers for the callables: the cross-game surface comes
// from @parlor/web; submitMove (game-specific payload) uses the callable
// factory directly. CheckersGameOptions is the client twin of the backend's —
// structurally identical; the emulator e2e exercises compatibility.
import { callable, createGameApi } from '@parlor/web/gameApi';
import type { SeatChoice, CheckersGameOptions } from '../gameOptions';

const api = createGameApi<CheckersGameOptions, SeatChoice>();

export const { createGame, joinGame, cancelGame, challengeUser, respondChallenge, resign, rematch } =
  api;

/** The typed JSON move on the wire — the whole path as plain cell indices
 * (multi-jumps are one move). */
export interface WireMove {
  path: number[];
}

export const submitMove = callable<
  { gameId: string; expectedMoveCount: number; move: WireMove },
  { moveCount: number }
>('submitMove');
