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
import { seatKeysOf, withdrawInTx, type WithdrawConfig } from './withdraw';

const WARN_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SweepResult {
  forfeited: number;
  warned: number;
  invitesCulled: number;
  /** Open 3+ rooms culled because they never reached `players.min` before the
   * invite expired — a two-seat open game is culled by its invite alone. */
  roomsCulled: number;
}

export interface ForfeitConfig extends WithdrawConfig {
  /** Seat keys in move order (e.g. ['p0', 'p1']) — `toMove`/`result` values.
   * A list, not a pair, so a GameServerConfig drops straight in (T7.4). */
  seatKeys: readonly string[];
  /** Fewest players a game can start with; an open room that never reached it
   * is culled with its invite. Defaults to 2. */
  players?: { min: number; max: number };
  notify: NotifyConfig;
}

export interface ForfeitHandlers {
  runForfeitSweep(db: Firestore, now: number, transport?: PushTransport): Promise<SweepResult>;
  /** The hourly production schedule (export from the consumer's index). */
  forfeitExpired: ScheduleFunction;
}

export function createForfeitHandlers(config: ForfeitConfig): ForfeitHandlers {
  const MIN_PLAYERS = config.players?.min ?? 2;
  const notify = createNotify(config.notify);

  interface SweepGameDoc {
    players: Record<string, string | null>;
    playerNames: Record<string, string | null>;
    toMove: string;
    moveCount: number;
    withdrawn?: string[];
    timeControl?: { days: number } | null;
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
    const result: SweepResult = { forfeited: 0, warned: 0, invitesCulled: 0, roomsCulled: 0 };

    const active = await db
      .collection('games')
      .where('status', '==', 'active')
      .where('deadlineAt', '<=', Timestamp.fromMillis(now + WARN_WINDOW_MS))
      .get();

    for (const gameSnap of active.docs) {
      const game = gameSnap.data() as SweepGameDoc;
      if (!game.deadlineAt) continue;
      const seats = seatKeysOf(config, game);
      const loserSeat = game.toMove;
      const loserIndex = seats.indexOf(loserSeat);
      const winnerSeat = seats[loserIndex === 0 ? 1 : 0] ?? loserSeat;
      const loserUid = game.players[loserSeat] ?? null;
      const winnerUid = game.players[winnerSeat] ?? null;
      const loserName = game.playerNames[loserSeat] ?? 'Your opponent';
      const winnerName = game.playerNames[winnerSeat] ?? 'Your opponent';

      if (game.deadlineAt.toMillis() <= now) {
        // Timeout: terminal at two seats, a WITHDRAWAL at three or four — the
        // same routine `resign` runs, so the two can never drift apart.
        let outcome: { finished: boolean; remaining: string[] } = { finished: true, remaining: [] };
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(gameSnap.ref);
          const doc = fresh.data() as SweepGameDoc & { status: string };
          if (doc.status !== 'active' || !doc.deadlineAt || doc.deadlineAt.toMillis() > now) return;
          outcome = await withdrawInTx(config, tx, gameSnap.ref, doc, loserIndex, 'timeout', loserUid);
          result.forfeited++;
        });
        await sendMaybe(db, transport, loserUid, 'game-over', {
          gameId: gameSnap.id,
          opponentName: winnerName,
          outcome: outcome.finished ? 'You lost on time' : 'You ran out of time and are out',
        });
        for (const uid of outcome.remaining) {
          await sendMaybe(db, transport, uid, 'game-over', {
            gameId: gameSnap.id,
            opponentName: loserName,
            outcome: outcome.finished ? 'You won on time' : `${loserName} ran out of time`,
          });
        }
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
      // A 3+ room outlives its invite: the guest list is the game, so an
      // expired code would leave an unjoinable room sitting in every guest's
      // lobby forever. Cull the room too, unless it reached the minimum and
      // could still be started by its host.
      const gameId = invite.data()['gameId'] as string | undefined;
      if (gameId) {
        const gameRef = db.collection('games').doc(gameId);
        const game = await gameRef.get();
        const data = game.data() as { status?: string; maxPlayers?: number; roster?: unknown[] } | undefined;
        if (
          data?.status === 'open' &&
          typeof data.maxPlayers === 'number' &&
          (data.roster?.length ?? 0) < MIN_PLAYERS
        ) {
          await gameRef.delete();
          result.roomsCulled++;
        }
      }
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
