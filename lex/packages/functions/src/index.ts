// ported from hive/packages/functions/src/index.ts (adapted)
// @lex/functions — server-authoritative game API (DESIGN §6.3). The shared
// callables are @parlor/server shells shaped by lex's config; submitMove
// (game-specific, T4.5) lives here. `ping` is the emulator-wiring smoke check.
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { createForfeitHandlers, createGameCallables, createSubmitMove } from '@parlor/server';
import { lexServerConfig } from './config';
import { lexSubmitConfig } from './submitMove';

initializeApp();

export const ping = onCall<{ echo?: string }>((request) => {
  return { pong: true, echo: request.data?.echo ?? null };
});

export const { createGame, joinGame, cancelGame, challengeUser, respondChallenge, rematch, resign } =
  createGameCallables(lexServerConfig);

// submitMove is the @parlor/server createSubmitMove shell shaped by lex's engine
// `advance` (lexSubmitConfig). lex is a hidden-information game and does NOT opt
// into the draw capability (createDrawCallables) — its draws arise from tied
// scores in the engine, not from an offer.
export const submitMove = createSubmitMove(lexSubmitConfig);

export const { forfeitExpired } = createForfeitHandlers(lexServerConfig);
/** Test seam: the sweep core, fired directly with a pinned now. */
export { createForfeitHandlers, lexServerConfig };
