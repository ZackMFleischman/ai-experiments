// @checkers/functions — server-authoritative game API: every callable is a
// @parlor/server shell shaped by checkers's config. createGame / joinGame /
// cancelGame / challengeUser / respondChallenge / rematch / resign
// (createGameCallables), submitMove (createSubmitMove over the engine
// `advance`), and the hourly forfeit sweep (createForfeitHandlers — checkers's
// toMove IS a seat key, so the generic sweep needs nothing game-side).
// Checkers's only draw is engine-derived (threefold repetition), so the
// opt-in draw callables are deliberately not included (lex's pattern).
// `ping` remains the emulator-wiring smoke check.
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { createForfeitHandlers, createGameCallables, createSubmitMove } from '@parlor/server';
import { checkersServerConfig, checkersSubmitConfig } from './config';

initializeApp();

export const ping = onCall<{ echo?: string }>((request) => {
  return { pong: true, echo: request.data?.echo ?? null };
});

export const { createGame, joinGame, cancelGame, challengeUser, respondChallenge, rematch, resign } =
  createGameCallables(checkersServerConfig);

export const submitMove = createSubmitMove(checkersSubmitConfig);

const handlers = createForfeitHandlers(checkersServerConfig);
export const forfeitExpired = handlers.forfeitExpired;
// Test seam: emulator tests fire the sweep core directly with a pinned now.
export const runForfeitSweep = handlers.runForfeitSweep;
export { checkersServerConfig };
