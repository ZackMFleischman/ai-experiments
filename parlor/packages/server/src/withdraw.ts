// A seat leaving a running game (DECISIONS 2026-08-28). At two seats that
// ends the game, byte for byte as it always has. At three or four it is a
// WITHDRAWAL: the leaver's score freezes, their tiles go back where the game
// says they go, the turn order skips them, and play continues until one active
// player remains. Shared by `resign` (games.ts) and the timeout sweep
// (forfeit.ts) so the two can never drift apart.
import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { deadlineFor } from './helpers';

/**
 * What a game reports after taking a seat out mid-game. Withdrawal touches
 * game-specific state (lex returns the rack to the bag), so parlor asks the
 * game to do it and only owns the doc bookkeeping around it.
 */
export interface WithdrawResult {
  /** Game-doc updates (public snapshot, toMove, counts…). */
  gameFields: Record<string, unknown>;
  /** [subcollection, docId] writes, e.g. the private state snapshot. */
  subWrites?: ReadonlyArray<{
    path: readonly [collection: string, docId: string];
    data: Record<string, unknown>;
    merge?: boolean;
  }>;
  /** Set when the withdrawal ENDED the game (one player left standing, or a
   * shrinking scoreless limit tipping over). */
  terminal?: { result: string; endedBy: string; standings?: readonly (readonly string[])[] } | null;
}


/** The slice of a game's config a withdrawal needs. */
export interface WithdrawConfig {
  seatKeys: readonly string[];
  withdrawSeat?(ctx: {
    tx: Transaction;
    gameRef: DocumentReference;
    doc: DocumentData;
    seat: number;
  }): Promise<WithdrawResult> | WithdrawResult;
}

interface WithdrawDoc extends DocumentData {
  players: Record<string, string | null>;
  moveCount: number;
  withdrawn?: string[];
  timeControl?: { days: number } | null;
}

/** Seat keys this game doc actually dealt, in move order. */
export const seatKeysOf = (config: WithdrawConfig, doc: Pick<WithdrawDoc, 'players'>): string[] =>
  config.seatKeys.filter((key) => key in doc.players);

export async function withdrawInTx(
  config: WithdrawConfig,
  tx: Transaction,
  gameRef: DocumentReference,
  doc: WithdrawDoc,
  seat: number,
  kind: 'resign' | 'timeout',
  by: string | null,
): Promise<{ finished: boolean; remaining: string[] }> {
  const seats = seatKeysOf(config, doc);
  const already = doc.withdrawn ?? [];
  const leaving = seats[seat];
  if (leaving === undefined) throw new Error(`this game has no seat ${seat}`);

  tx.set(gameRef.collection('moves').doc(String(doc.moveCount)), {
    n: doc.moveCount,
    kind,
    by,
    at: FieldValue.serverTimestamp(),
  });

  // Two seats — or a game that never opted into withdrawal — stays terminal.
  if (seats.length <= 2 || !config.withdrawSeat) {
    const winnerSeat = seats[seat === 0 ? 1 : 0]!;
    tx.update(gameRef, {
      moveCount: doc.moveCount + 1,
      status: 'finished',
      result: winnerSeat,
      endedBy: kind,
      deadlineAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { finished: true, remaining: [doc.players[winnerSeat] ?? ''].filter(Boolean) };
  }

  // The game owns the state change (lex returns the rack to the bag). It may
  // read, so it runs before every write below.
  const applied = await config.withdrawSeat({ tx, gameRef, doc, seat });
  const withdrawn = [...already, leaving];
  tx.update(gameRef, {
    moveCount: doc.moveCount + 1,
    withdrawn,
    deadlineAt: applied.terminal ? null : deadlineFor(doc.timeControl ?? null),
    deadlineWarnedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    ...applied.gameFields,
    ...(applied.terminal
      ? {
          status: 'finished',
          result: applied.terminal.result,
          endedBy: applied.terminal.endedBy,
          ...(applied.terminal.standings ? { standings: applied.terminal.standings } : {}),
        }
      : {}),
  });
  for (const sub of applied.subWrites ?? []) {
    const ref = gameRef.collection(sub.path[0]).doc(sub.path[1]);
    if (sub.merge) tx.set(ref, sub.data, { merge: true });
    else tx.set(ref, sub.data);
  }

  const remaining = seats
    .filter((key) => key !== leaving && !withdrawn.includes(key))
    .map((key) => doc.players[key])
    .filter((uid): uid is string => !!uid);
  return { finished: !!applied.terminal, remaining };
}
