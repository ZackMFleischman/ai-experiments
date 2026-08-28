// ported from hive/packages/functions/src/forfeit.ts (adapted)
// Scheduled forfeits: hourly sweep — forfeit past-deadline games (timeout
// meta event + pushes), warn games within 24h of their deadline, cull expired
// invites. The core is a plain function so tests fire it directly with a
// pinned `now` (no waiting an hour). Seat naming and push copy come from the
// injected config.
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onSchedule, type ScheduleFunction } from 'firebase-functions/v2/scheduler';
import { createNotify, sendPush, type NotifyConfig, type PushTransport, type SharedTrigger, type TriggerArgs } from './notify';

const WARN_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SweepResult {
  forfeited: number;
  warned: number;
  invitesCulled: number;
}

export interface ForfeitConfig {
  /** Seat keys in move order (e.g. ['p0', 'p1']) — `toMove`/`result` values.
   * A list, not a pair, so a GameServerConfig drops straight in (T7.4). */
  seatKeys: readonly string[];
  notify: NotifyConfig;
}

export interface ForfeitHandlers {
  runForfeitSweep(db: Firestore, now: number, transport?: PushTransport): Promise<SweepResult>;
  /** The hourly production schedule (export from the consumer's index). */
  forfeitExpired: ScheduleFunction;
}

export function createForfeitHandlers(config: ForfeitConfig): ForfeitHandlers {
  // T7.7 turns an expired 3+ game into a withdrawal; today every forfeit is
  // terminal and hands the game to the other seat.
  const SEAT0 = config.seatKeys[0]!;
  const SEAT1 = config.seatKeys[1]!;
  const notify = createNotify(config.notify);

  interface SweepGameDoc {
    players: Record<string, string | null>;
    playerNames: Record<string, string | null>;
    toMove: string;
    moveCount: number;
    deadlineAt?: Timestamp | null;
    deadlineWarnedAt?: Timestamp;
  }

  // Test runs inject a fake transport; production goes through notify()'s
  // best-effort admin messaging.
  async function sendMaybe(
    db: Firestore,
    transport: PushTransport | undefined,
    uid: string | null | undefined,
    trigger: SharedTrigger,
    args: TriggerArgs,
  ): Promise<void> {
    if (!uid) return;
    if (transport) {
      try {
        await sendPush(db, config.notify, transport, uid, config.notify.buildPayload(trigger, args));
      } catch {
        /* best-effort */
      }
      return;
    }
    await notify(db, uid, trigger, args);
  }

  async function runForfeitSweep(
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
      const loserSeat = game.toMove;
      const winnerSeat = loserSeat === SEAT0 ? SEAT1 : SEAT0;
      const loserUid = game.players[loserSeat] ?? null;
      const winnerUid = game.players[winnerSeat] ?? null;
      const loserName = game.playerNames[loserSeat] ?? 'Your opponent';
      const winnerName = game.playerNames[winnerSeat] ?? 'Your opponent';

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
            result: winnerSeat,
            endedBy: 'timeout',
            moveCount: doc.moveCount + 1,
            deadlineAt: null,
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

  const forfeitExpired = onSchedule('every 60 minutes', async () => {
    await runForfeitSweep(getFirestore(), Date.now());
  });

  return { runForfeitSweep, forfeitExpired };
}
