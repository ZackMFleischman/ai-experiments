// @hive/functions — server-authoritative game API (DESIGN §5.3). The generic
// callables (createGame / joinGame / cancelGame / challengeUser /
// respondChallenge / rematch / resign) are @parlor/server shells shaped by
// hive's config; the game-specific ones (submitMove / offerDraw / respondDraw)
// live in games.ts. `ping` remains the emulator-wiring smoke check.
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { createGameCallables } from '@parlor/server';
import { hiveServerConfig } from './config';

initializeApp();

export const ping = onCall<{ echo?: string }>((request) => {
  return { pong: true, echo: request.data?.echo ?? null };
});

export const { createGame, joinGame, cancelGame, challengeUser, respondChallenge, rematch, resign } =
  createGameCallables(hiveServerConfig);

export { submitMove, offerDraw, respondDraw } from './games';
export { forfeitExpired } from './forfeit';
