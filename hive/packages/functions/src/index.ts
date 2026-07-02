// @hive/functions — skeleton until M4. Game callables (DESIGN §5.3) land there;
// for now `ping` proves the emulator wiring end to end.
import { onCall } from 'firebase-functions/v2/https';

export const ping = onCall<{ echo?: string }>((request) => {
  return { pong: true, echo: request.data?.echo ?? null };
});
