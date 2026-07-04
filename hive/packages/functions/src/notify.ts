// Push notifications (T5.3, DESIGN §7): data-only webpush messages — the app's
// service worker owns rendering and tap-to-deep-link. Sends are best-effort
// (never fail a callable) and prune tokens the push service has forgotten.
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

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

/** The slice of admin messaging we use — injectable for tests. */
export interface PushTransport {
  sendEachForMulticast(message: {
    tokens: string[];
    data: Record<string, string>;
    webpush?: { headers?: Record<string, string> };
  }): Promise<{ responses: Array<{ success: boolean; error?: { code?: string } }> }>;
}

/** How many games await the recipient: active games on their move plus
 * incoming challenges — the same filter as the client's useTurnBadge, so the
 * home-screen icon badge (Badging API, set by the SW) matches the lobby. */
export async function countActionable(db: Firestore, uid: string): Promise<number> {
  const mine = db.collection('games').where('playerIds', 'array-contains', uid);
  const [active, open] = await Promise.all([
    mine.where('status', '==', 'active').get(),
    mine.where('status', '==', 'open').get(),
  ]);
  const myTurn = active.docs.filter((d) => {
    const g = d.data() as { players: { white: string | null }; toMove: string };
    return g.toMove === (g.players.white === uid ? 'w' : 'b');
  });
  const challenges = open.docs.filter(
    (d) => (d.data() as { challenge?: { to: string } }).challenge?.to === uid,
  );
  return myTurn.length + challenges.length;
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export async function sendPush(
  db: Firestore,
  transport: PushTransport,
  uid: string,
  payload: PushPayload,
): Promise<void> {
  const user = await db.doc(`users/${uid}`).get();
  const tokens = (user.data()?.['fcmTokens'] as string[] | undefined) ?? [];
  if (tokens.length === 0) return;

  const badge = await countActionable(db, uid);
  const res = await transport.sendEachForMulticast({
    tokens,
    data: {
      title: payload.title,
      body: payload.body,
      link: payload.link,
      tag: payload.tag,
      badge: String(badge),
    },
    webpush: { headers: { Urgency: 'high' } },
  });

  const dead = tokens.filter((_, i) => {
    const r = res.responses[i];
    return r && !r.success && DEAD_TOKEN_CODES.has(r.error?.code ?? '');
  });
  if (dead.length > 0) {
    await db.doc(`users/${uid}`).update({ fcmTokens: FieldValue.arrayRemove(...dead) });
  }
}

/** Fire-and-forget wrapper for callables: a push must never fail the move. */
export async function notify(
  db: Firestore,
  uid: string | null | undefined,
  trigger: Trigger,
  args: TriggerArgs,
): Promise<void> {
  if (!uid) return;
  try {
    const { getMessaging } = await import('firebase-admin/messaging');
    await sendPush(db, getMessaging(), uid, buildPayload(trigger, args));
  } catch {
    // best-effort: emulator runs have no FCM; production errors surface in logs
  }
}
