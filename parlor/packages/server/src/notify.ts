// ported from hive/packages/functions/src/notify.ts (adapted)
// Push notifications: data-only webpush messages — the app's service worker
// owns rendering and tap-to-deep-link. Sends are best-effort (never fail a
// callable) and prune tokens the push service has forgotten. Payload copy
// and the my-turn predicate are injected per game.
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/** Triggers the shared callables fire; games may add their own strings. */
export type SharedTrigger =
  | 'opponent-moved'
  | 'game-joined'
  | 'rematch-offered'
  | 'challenge-received'
  | 'challenge-accepted'
  | 'challenge-declined'
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
  /** Who did the thing. At two seats that is always the opponent, which is what
   * this was called; `actorName` is the name that survives at 3+, where the
   * actor is one of several other players. Parlor sets both — a game may read
   * either, and every existing buildPayload keeps reading `opponentName`. */
  opponentName: string;
  actorName?: string;
  /** game-over headline, from the recipient's perspective. */
  outcome?: string;
  hoursLeft?: number;
}

/** Who acted, preferring the N-seat name. */
export const actorOf = (args: TriggerArgs): string => args.actorName ?? args.opponentName;

/**
 * Guest-list triggers (3+ only). A capability beyond SharedTrigger, exactly as
 * DrawTrigger is: parlor builds the copy itself so that adding these does not
 * make an existing game's `buildPayload` switch non-exhaustive.
 */
export type RoomTrigger = 'invited' | 'player-joined' | 'game-started';

/** Default guest-list push copy, overridable per game via NotifyConfig. */
export function defaultRoomPayload(trigger: RoomTrigger, args: TriggerArgs): PushPayload {
  const link = `/game/${args.gameId}`;
  const tag = `game-${args.gameId}`;
  const actor = actorOf(args);
  switch (trigger) {
    case 'invited':
      return {
        title: `${actor} invited you to a game`,
        // Invitations reserve nothing, so the urgency is real, not a nudge.
        body: args.outcome ?? 'Seats are first come, first served — join before it fills.',
        link,
        tag,
      };
    case 'player-joined':
      return {
        title: `${actor} joined your game`,
        body: args.outcome ?? 'Waiting for the rest of the table.',
        link,
        tag,
      };
    case 'game-started':
      return {
        title: 'Your game has started',
        body: args.outcome ?? `${actor} started the game — see who is in and where you sit.`,
        link,
        tag,
      };
  }
}

export interface NotifyConfig {
  buildPayload(trigger: SharedTrigger, args: TriggerArgs): PushPayload;
  /** Override the guest-list copy (default: defaultRoomPayload). */
  roomPayload?(trigger: RoomTrigger, args: TriggerArgs): PushPayload;
  /** Is it this uid's move in this game doc? (seat naming is game-specific.) */
  isMyTurn(game: DocumentData, uid: string): boolean;
}

/** The slice of admin messaging we use — injectable for tests. */
export interface PushTransport {
  sendEachForMulticast(message: {
    tokens: string[];
    data: Record<string, string>;
    webpush?: { headers?: Record<string, string> };
  }): Promise<{ responses: Array<{ success: boolean; error?: { code?: string } }> }>;
}

/** How many games await the recipient: active games on their move, incoming
 * challenges, and just-started games the opponent activated (accepted invite
 * or challenge, rematch offer) even when they move first. Same filter as the
 * client's actionableCount, so the home-screen icon badge (Badging API, set
 * by the SW) matches the lobby. */
export async function countActionable(
  db: Firestore,
  config: NotifyConfig,
  uid: string,
): Promise<number> {
  const mine = db.collection('games').where('playerIds', 'array-contains', uid);
  const [active, open] = await Promise.all([
    mine.where('status', '==', 'active').get(),
    mine.where('status', '==', 'open').get(),
  ]);
  const actionable = active.docs.filter((d) => {
    const g = d.data() as { moveCount?: number; activatedBy?: string };
    const fresh = g.moveCount === 0 && g.activatedBy !== undefined && g.activatedBy !== uid;
    return config.isMyTurn(d.data(), uid) || fresh;
  });
  const challenges = open.docs.filter(
    (d) => (d.data() as { challenge?: { to: string } }).challenge?.to === uid,
  );
  // A pending invitation to a 3+ room is actionable in exactly the same way a
  // challenge is: it is waiting on your answer.
  const invitations = open.docs.filter((d) =>
    ((d.data() as { invited?: { uid: string }[] }).invited ?? []).some((e) => e.uid === uid),
  );
  return actionable.length + challenges.length + invitations.length;
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export async function sendPush(
  db: Firestore,
  config: NotifyConfig,
  transport: PushTransport,
  uid: string,
  payload: PushPayload,
): Promise<void> {
  const user = await db.doc(`users/${uid}`).get();
  const tokens = (user.data()?.['fcmTokens'] as string[] | undefined) ?? [];
  if (tokens.length === 0) return;

  const badge = await countActionable(db, config, uid);
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

export type Notify = (
  db: Firestore,
  uid: string | null | undefined,
  trigger: SharedTrigger,
  args: TriggerArgs,
) => Promise<void>;

export type NotifyRoom = (
  db: Firestore,
  uids: ReadonlyArray<string | null | undefined>,
  trigger: RoomTrigger,
  args: TriggerArgs,
) => Promise<void>;

async function fire(
  db: Firestore,
  config: NotifyConfig,
  uid: string | null | undefined,
  payload: () => PushPayload,
): Promise<void> {
  if (!uid) return;
  try {
    const { getMessaging } = await import('firebase-admin/messaging');
    await sendPush(db, config, getMessaging(), uid, payload());
  } catch {
    // best-effort: emulator runs have no FCM; production errors surface in logs
  }
}

/** Fire-and-forget wrapper for callables: a push must never fail the move. */
export function createNotify(config: NotifyConfig): Notify {
  return async (db, uid, trigger, args) =>
    fire(db, config, uid, () => config.buildPayload(trigger, args));
}

/** The same, fanned out over a guest list. Recipients are deduped and each
 *  send is independent — one dead token must not silence the rest. */
export function createNotifyRoom(config: NotifyConfig): NotifyRoom {
  const payload = config.roomPayload?.bind(config) ?? defaultRoomPayload;
  return async (db, uids, trigger, args) => {
    const seen = new Set<string>();
    for (const uid of uids) {
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      await fire(db, config, uid, () => payload(trigger, args));
    }
  };
}
