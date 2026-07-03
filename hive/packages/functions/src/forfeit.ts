// Scheduled forfeits (T5.5, DESIGN §5.4): hourly sweep — forfeit past-deadline
// games (timeout meta event + pushes), warn games within 24h of their
// deadline, cull expired invites. The core is a plain function so tests fire
// it directly with a pinned `now` (no waiting an hour).
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { buildPayload, notify, sendPush, type PushTransport } from './notify';

const WARN_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SweepGameDoc {
  players: { white: string | null; black: string | null };
  playerNames: { white: string | null; black: string | null };
  toMove: 'w' | 'b';
  moveCount: number;
  deadlineAt?: Timestamp | null;
  deadlineWarnedAt?: Timestamp;
}

export interface SweepResult {
  forfeited: number;
  warned: number;
  invitesCulled: number;
}

export async function runForfeitSweep(
  db: Firestore,
  now: number,
  transport?: PushTransport,
): Promise<SweepResult> {
  const result: SweepResult = { forfeited: 0, warned: 0, invitesCulled: 0 };

  const active = await db
    .collection('games')
    .where('status', '==', 'active')
    .where('deadlineAt', '<=', Timestamp.fromMillis(now + WARN_WINDOW_MS))
    .get();

  for (const gameSnap of active.docs) {
    const game = gameSnap.data() as SweepGameDoc;
    if (!game.deadlineAt) continue;
    const loserColor = game.toMove;
    const loserUid = loserColor === 'w' ? game.players.white : game.players.black;
    const winnerUid = loserColor === 'w' ? game.players.black : game.players.white;
    const loserName =
      (loserColor === 'w' ? game.playerNames.white : game.playerNames.black) ?? 'Your opponent';
    const winnerName =
      (loserColor === 'w' ? game.playerNames.black : game.playerNames.white) ?? 'Your opponent';

    if (game.deadlineAt.toMillis() <= now) {
      // Forfeit: timeout meta event in the move log + terminal game doc.
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(gameSnap.ref);
        const doc = fresh.data() as SweepGameDoc & { status: string };
        if (doc.status !== 'active' || !doc.deadlineAt || doc.deadlineAt.toMillis() > now) return;
        tx.set(gameSnap.ref.collection('moves').doc(String(doc.moveCount)), {
          n: doc.moveCount,
          kind: 'timeout',
          by: loserUid,
          at: FieldValue.serverTimestamp(),
        });
        tx.update(gameSnap.ref, {
          status: 'finished',
          result: loserColor === 'w' ? 'black' : 'white',
          endedBy: 'timeout',
          moveCount: doc.moveCount + 1,
          deadlineAt: null,
          pendingDrawOffer: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        result.forfeited++;
      });
      await sendMaybe(db, transport, loserUid, 'game-over', {
        gameId: gameSnap.id,
        opponentName: winnerName,
        outcome: 'You lost on time',
      });
      await sendMaybe(db, transport, winnerUid, 'game-over', {
        gameId: gameSnap.id,
        opponentName: loserName,
        outcome: 'You won on time',
      });
    } else if (!game.deadlineWarnedAt) {
      // Within the warning window and not yet nudged.
      const hoursLeft = Math.max(1, Math.round((game.deadlineAt.toMillis() - now) / 3_600_000));
      await gameSnap.ref.update({ deadlineWarnedAt: Timestamp.fromMillis(now) });
      result.warned++;
      await sendMaybe(db, transport, loserUid, 'deadline-warning', {
        gameId: gameSnap.id,
        opponentName: winnerName,
        hoursLeft,
      });
    }
  }

  const expired = await db
    .collection('invites')
    .where('expiresAt', '<=', Timestamp.fromMillis(now))
    .get();
  for (const invite of expired.docs) {
    await invite.ref.delete();
    result.invitesCulled++;
  }

  return result;
}

// Test runs inject a fake transport; production goes through notify()'s
// best-effort admin messaging.
async function sendMaybe(
  db: Firestore,
  transport: PushTransport | undefined,
  uid: string | null,
  trigger: Parameters<typeof buildPayload>[0],
  args: Parameters<typeof buildPayload>[1],
): Promise<void> {
  if (!uid) return;
  if (transport) {
    try {
      await sendPush(db, transport, uid, buildPayload(trigger, args));
    } catch {
      /* best-effort */
    }
    return;
  }
  await notify(db, uid, trigger, args);
}

export const forfeitExpired = onSchedule('every 60 minutes', async () => {
  await runForfeitSweep(getFirestore(), Date.now());
});
