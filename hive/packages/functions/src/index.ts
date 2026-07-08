// @hive/functions — server-authoritative game API (DESIGN §5.3). All the
// standard callables are now @parlor/server shells shaped by hive's config:
// createGame / joinGame / cancelGame / challengeUser / respondChallenge /
// rematch / resign (createGameCallables), submitMove (createSubmitMove, with
// hive's engine `advance`), and offerDraw / respondDraw (createDrawCallables —
// the opt-in draw CAPABILITY, which lex does not use). Only the forfeit sweep
// stays game-side (it reads the engine color `toMove`, not a seat key).
// `ping` remains the emulator-wiring smoke check.
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { createDrawCallables, createGameCallables, createSubmitMove } from '@parlor/server';
import { hiveServerConfig, hiveSubmitConfig } from './config';
import { buildPayload } from './notify';

initializeApp();

export const ping = onCall<{ echo?: string }>((request) => {
  return { pong: true, echo: request.data?.echo ?? null };
});

export const { createGame, joinGame, cancelGame, challengeUser, respondChallenge, rematch, resign } =
  createGameCallables(hiveServerConfig);

export const submitMove = createSubmitMove(hiveSubmitConfig);

// Opt-in draw capability. hive keeps its own draw-offer push copy via the
// override (parlor ships an identical default).
export const { offerDraw, respondDraw } = createDrawCallables(hiveServerConfig, {
  drawOfferedPayload: (args) => buildPayload('draw-offered', args),
});

export { forfeitExpired } from './forfeit';
