// @hive/functions — server-authoritative game API (DESIGN §5.3). All game
// mutations are callables validating with @hive/engine; `ping` remains as the
// emulator-wiring smoke check.
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';

initializeApp();

export const ping = onCall<{ echo?: string }>((request) => {
  return { pong: true, echo: request.data?.echo ?? null };
});

export { cancelGame, createGame, joinGame, offerDraw, rematch, resign, respondDraw, submitMove } from './games';
export { forfeitExpired } from './forfeit';
