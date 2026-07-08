// createSubmitMove — the shared "make a move" callable shell (parlor hardening
// Phase 2a). Every parlor game had create/join/rematch/resign in @parlor/server
// but not the one mutation most conspicuously absent: submitting a move. The
// shell owns everything generic — auth, the {gameId, expectedMoveCount} envelope,
// the transaction preconditions (doc exists, caller is a player, game active,
// concurrency guard, and it's the caller's turn via config.notify.isMyTurn), the
// moveCount / deadline bookkeeping, the UNCONDITIONAL pendingDrawOffer clear (a
// move voids any pending draw — a harmless no-op for games without draws, which
// is what lets 2a and 2b compose), and the fire-and-forget push afterward.
//
// The game injects the ONLY game-specific core via `advance`: it reads whatever
// private state it needs (lex's bag), runs its engine, and returns the move-doc
// fields, the game-doc fields, any sub-writes (lex's rack + bag), the terminal
// outcome, and the push descriptor. `parseMove` receives the whole request.data
// so a game reads its own move field (hive: `uhpMove` string; lex: `move`
// object) — no wire-contract change on migration.
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableFunction } from 'firebase-functions/v2/https';
import { deadlineFor, requireAuth, requireGameId, type Caller } from './helpers';
import { createNotify, type SharedTrigger, type TriggerArgs } from './notify';
import type { GameServerConfig } from './games';

export interface AdvanceContext<TMove> {
  /** The open transaction — `advance` may `tx.get()` private docs (lex's bag)
   * BEFORE it returns; the shell performs all writes after, so Firestore's
   * reads-before-writes rule holds. */
  tx: Transaction;
  gameRef: DocumentReference;
  gameId: string;
  /** The current game doc (pre-move). */
  doc: DocumentData;
  move: TMove;
  /** Caller's seat index (0 = seatKeys[0], moves first). */
  mySeat: 0 | 1;
  caller: Caller;
  expectedMoveCount: number;
}

export interface SubWrite {
  /** [subcollection, docId] under the game doc, e.g. ['racks', uid]. */
  path: readonly [collection: string, docId: string];
  data: Record<string, unknown>;
  /** Merge into the existing doc (default overwrite). */
  merge?: boolean;
}

export interface AdvanceResult {
  /** moves/{n} fields; the shell adds n, by, at. */
  moveDoc: Record<string, unknown>;
  /** game-doc updates (state|public, toMove, scores, lastPlay…); the shell adds
   * moveCount, pendingDrawOffer clear, deadline bookkeeping, updatedAt, terminal. */
  gameFields: Record<string, unknown>;
  subWrites?: readonly SubWrite[];
  terminal?: { result: string; endedBy: string } | null;
  push: { recipientUid: string | null; trigger: SharedTrigger; args: TriggerArgs };
}

export interface SubmitMoveConfig<TOptions, TMove> extends GameServerConfig<TOptions> {
  /** Validate the move off the wire (receives the whole request.data). */
  parseMove(data: unknown): TMove;
  /** The one game-specific core — see AdvanceContext / AdvanceResult. */
  advance(ctx: AdvanceContext<TMove>): Promise<AdvanceResult> | AdvanceResult;
}

interface SubmitDocData extends DocumentData {
  status: string;
  players: Record<string, string | null>;
  playerIds: string[];
  moveCount: number;
  timeControl?: { days: number } | null;
}

export function createSubmitMove<TOptions, TMove>(
  config: SubmitMoveConfig<TOptions, TMove>,
): CallableFunction<unknown, unknown> {
  const [SEAT0] = config.seatKeys;
  const notify = createNotify(config.notify);

  return onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const expectedMoveCount = (request.data as { expectedMoveCount?: unknown })?.expectedMoveCount;
    if (typeof expectedMoveCount !== 'number') {
      throw new HttpsError('invalid-argument', 'missing expectedMoveCount');
    }
    const move = config.parseMove(request.data);

    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);

    const { moveCount, push } = await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as SubmitDocData;
      if (!doc.playerIds.includes(caller.uid)) {
        throw new HttpsError('permission-denied', 'not a player in this game');
      }
      if (doc.status !== 'active') throw new HttpsError('failed-precondition', 'game is not active');
      if (doc.moveCount !== expectedMoveCount) {
        throw new HttpsError(
          'failed-precondition',
          `stale expectedMoveCount (game is at ${doc.moveCount})`,
        );
      }
      if (!config.notify.isMyTurn(doc, caller.uid)) {
        throw new HttpsError('failed-precondition', 'not your turn');
      }
      const mySeat: 0 | 1 = doc.players[SEAT0] === caller.uid ? 0 : 1;

      const res = await config.advance({
        tx,
        gameRef,
        gameId,
        doc,
        move,
        mySeat,
        caller,
        expectedMoveCount,
      });

      tx.set(gameRef.collection('moves').doc(String(expectedMoveCount)), {
        n: expectedMoveCount,
        ...res.moveDoc,
        by: caller.uid,
        at: FieldValue.serverTimestamp(),
      });
      tx.update(gameRef, {
        moveCount: expectedMoveCount + 1,
        // A move voids any pending draw offer (composes with createDrawCallables;
        // a harmless no-op for games without draws).
        pendingDrawOffer: FieldValue.delete(),
        deadlineAt: res.terminal ? null : deadlineFor(doc.timeControl ?? null),
        deadlineWarnedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        ...res.gameFields,
        ...(res.terminal
          ? { status: 'finished', result: res.terminal.result, endedBy: res.terminal.endedBy }
          : {}),
      });
      for (const sub of res.subWrites ?? []) {
        const ref = gameRef.collection(sub.path[0]).doc(sub.path[1]);
        if (sub.merge) tx.set(ref, sub.data, { merge: true });
        else tx.set(ref, sub.data);
      }
      return { moveCount: expectedMoveCount + 1, push: res.push };
    });

    if (push) await notify(db, push.recipientUid, push.trigger, push.args);
    return { moveCount };
  });
}
