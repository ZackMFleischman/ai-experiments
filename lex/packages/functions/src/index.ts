// ported from hive/packages/functions/src/index.ts (adapted)
// @lex/functions — server-authoritative game API (DESIGN §6.3). Game
// callables (@parlor/server shells + lex's submitMove) land with M4; `ping`
// is the emulator-wiring smoke check.
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';

initializeApp();

export const ping = onCall<{ echo?: string }>((request) => {
  return { pong: true, echo: request.data?.echo ?? null };
});
