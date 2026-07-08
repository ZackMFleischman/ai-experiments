// Push notifications (T5.3, DESIGN §7): hive's game-specific push COPY
// (buildPayload) and the my-turn predicate (isMyTurn), now wired to
// @parlor/server's shared delivery machinery — the token fan-out, stale-token
// pruning, and actionable-count badge all live there (createNotify / sendPush /
// countActionable). This module keeps only what is genuinely hive's: the
// per-trigger copy and the color-based turn test. Data-only webpush; the app's
// service worker owns rendering and tap-to-deep-link.
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import {
  sendPush as parlorSendPush,
  type NotifyConfig,
  type PushTransport,
} from '@parlor/server';

export type { PushTransport };

// hive fires one trigger beyond the parlor shared set: 'draw-offered' (hive has
// draw offers; other parlor games don't).
export type Trigger =
  | 'opponent-moved'
  | 'game-joined'
  | 'rematch-offered'
  | 'challenge-received'
  | 'challenge-accepted'
  | 'challenge-declined'
  | 'draw-offered'
  | 'game-over'
  | 'deadline-warning';

export interface PushPayload {
  title: string;
  body: string;
  link: string;
  tag: string;
}

export interface TriggerArgs {
  gameId: string;
  opponentName: string;
  /** game-over headline, from the recipient's perspective. */
  outcome?: string;
  hoursLeft?: number;
}

export function buildPayload(trigger: Trigger, args: TriggerArgs): PushPayload {
  const link = `/game/${args.gameId}`;
  const tag = `game-${args.gameId}`;
  switch (trigger) {
    case 'opponent-moved':
      return {
        title: `Your move vs. ${args.opponentName}`,
        body: `${args.opponentName} played — the hive awaits.`,
        link,
        tag,
      };
    case 'game-joined':
      return {
        title: `${args.opponentName} joined your game`,
        body: 'The game is on — white opens.',
        link,
        tag,
      };
    case 'rematch-offered':
      return {
        title: `${args.opponentName} wants a rematch`,
        body: 'The return game is ready — colors swapped.',
        link,
        tag,
      };
    case 'challenge-received':
      return {
        title: `${args.opponentName} challenges you`,
        body: 'Accept or decline in your lobby.',
        link,
        tag,
      };
    case 'challenge-accepted':
      return {
        title: `${args.opponentName} accepted your challenge`,
        body: 'The game is on — white opens.',
        link,
        tag,
      };
    case 'challenge-declined':
      // The game doc is deleted on decline — deep-link to the lobby instead.
      return {
        title: `${args.opponentName} declined your challenge`,
        body: 'Maybe another time — start a new game from the lobby.',
        link: '/lobby',
        tag,
      };
    case 'draw-offered':
      return {
        title: `${args.opponentName} offers a draw`,
        body: 'Accept or decline in the game.',
        link,
        tag,
      };
    case 'game-over':
      return {
        title: args.outcome ?? 'Game over',
        body: `Game vs. ${args.opponentName} is over — see the final board.`,
        link,
        tag,
      };
    case 'deadline-warning':
      return {
        title: `Your move vs. ${args.opponentName} expires soon`,
        body: `About ${args.hoursLeft ?? 24}h left before the game is forfeit.`,
        link,
        tag,
      };
  }
}

/** Is it this uid's move in this game doc? hive names seats by color, so the
 * turn test maps the white/black player onto the engine's 'w'/'b' toMove. */
export function isMyTurn(game: DocumentData, uid: string): boolean {
  const players = game['players'] as { white: string | null; black: string | null };
  return game['toMove'] === (players.white === uid ? 'w' : 'b');
}

/** hive's NotifyConfig — the copy + turn predicate parlor's delivery layer
 * needs (fed to createGameCallables, sendPush, and the fire-and-forget notify). */
export const notifyConfig: NotifyConfig = { buildPayload, isMyTurn };

/** Fan-out + stale-token pruning + actionable-count badge — all parlor's, shaped
 * by hive's config. The 4-arg shape matches the callers (forfeit sweep, tests). */
export function sendPush(
  db: Firestore,
  transport: PushTransport,
  uid: string,
  payload: PushPayload,
): Promise<void> {
  return parlorSendPush(db, notifyConfig, transport, uid, payload);
}

/** Fire-and-forget wrapper for callables: a push must never fail the move. Typed
 * to hive's Trigger (incl. 'draw-offered'); parlor's createNotify is limited to
 * the shared triggers, so this thin variant reuses parlor's sendPush directly. */
export async function notify(
  db: Firestore,
  uid: string | null | undefined,
  trigger: Trigger,
  args: TriggerArgs,
): Promise<void> {
  if (!uid) return;
  try {
    const { getMessaging } = await import('firebase-admin/messaging');
    await parlorSendPush(db, notifyConfig, getMessaging(), uid, buildPayload(trigger, args));
  } catch {
    // best-effort: emulator runs have no FCM; production errors surface in logs
  }
}
