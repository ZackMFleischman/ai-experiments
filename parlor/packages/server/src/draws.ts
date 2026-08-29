// createDrawCallables — the first opt-in parlor CAPABILITY (hardening Phase 2b).
// Draws are useful for lots of games (chess, checkers, hive) but not all (lex's
// draws arise from tied scores, not an offer), so they are a capability a game
// opts into by CALLING this factory, not a core feature behind a flag. Opt in =
// call it and export the two callables; opt out = don't. No flags, no dead code.
//
// Draws extract almost for free: they touch only seatKeys + notify — both
// already in GameServerConfig. pendingDrawOffer keys by seatKeys[i] (which seat
// offered), with zero engine/color coupling. The three seams this capability
// owns: (1) a move clears the offer — handled by createSubmitMove's
// unconditional pendingDrawOffer clear; (2) the 'draw-offered' push trigger,
// which is NOT in SharedTrigger — parlor ships a default payload here so opting
// in doesn't force copy-writing, and a game may override it (its buildPayload
// widens to accept DrawTrigger, assignable to NotifyConfig's narrower param);
// (3) the client stubs (see @parlor/web ./sdk createDrawApi).
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableFunction } from 'firebase-functions/v2/https';
import { requireAuth, requireGameId } from './helpers';
import { createNotify, sendPush, type PushPayload, type TriggerArgs } from './notify';
import type { GameServerConfig } from './games';

/** A capability trigger beyond SharedTrigger. A game opting into draws widens
 * its buildPayload to `(SharedTrigger | DrawTrigger, args) => PushPayload`. */
export type DrawTrigger = 'draw-offered';

/** Default draw-offer push copy, so opting in doesn't force copy-writing. */
export function defaultDrawPayload(args: TriggerArgs): PushPayload {
  return {
    title: `${args.opponentName} offers a draw`,
    body: 'Accept or decline in the game.',
    link: `/game/${args.gameId}`,
    tag: `game-${args.gameId}`,
  };
}

export interface DrawCallables {
  offerDraw: CallableFunction<unknown, unknown>;
  respondDraw: CallableFunction<unknown, unknown>;
}

export interface DrawOptions {
  /** Override the draw-offer push copy (default: defaultDrawPayload). */
  drawOfferedPayload?: (args: TriggerArgs) => PushPayload;
}

interface DrawDoc extends DocumentData {
  status: string;
  players: Record<string, string | null>;
  playerIds: string[];
  moveCount: number;
  pendingDrawOffer?: string;
}

export function createDrawCallables<TOptions>(
  config: GameServerConfig<TOptions>,
  opts: DrawOptions = {},
): DrawCallables {
  // Draw offers are a strictly TWO-seat capability (an offer has exactly one
  // recipient), so this reads the first two seat keys rather than the list.
  const SEAT0 = config.seatKeys[0]!;
  const SEAT1 = config.seatKeys[1]!;
  const notify = createNotify(config.notify); // 'game-over' is a SharedTrigger
  const drawPayload = opts.drawOfferedPayload ?? defaultDrawPayload;
  const seatKey = (i: 0 | 1) => (i === 0 ? SEAT0 : SEAT1);
  const otherSeat = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

  function callerSeat(doc: DrawDoc, uid: string): 0 | 1 {
    if (!doc.playerIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'not a player in this game');
    }
    return doc.players[SEAT0] === uid ? 0 : 1;
  }

  // draw-offer / accept / decline are typed meta entries in the same ordered
  // move log (like resign), each bumping moveCount.
  function appendMeta(
    tx: FirebaseFirestore.Transaction,
    gameRef: FirebaseFirestore.DocumentReference,
    doc: DrawDoc,
    kind: 'draw-offer' | 'draw-accept' | 'draw-decline',
    uid: string,
    gameUpdates: Record<string, unknown>,
  ): void {
    tx.set(gameRef.collection('moves').doc(String(doc.moveCount)), {
      n: doc.moveCount,
      kind,
      by: uid,
      at: FieldValue.serverTimestamp(),
    });
    tx.update(gameRef, {
      moveCount: doc.moveCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
      ...gameUpdates,
    });
  }

  // Fire-and-forget draw-offered push (not a SharedTrigger, so parlor computes
  // the payload itself rather than routing through the shared Notify type).
  async function fireDrawOffered(
    db: FirebaseFirestore.Firestore,
    uid: string | null,
    args: TriggerArgs,
  ): Promise<void> {
    if (!uid) return;
    try {
      const { getMessaging } = await import('firebase-admin/messaging');
      await sendPush(db, config.notify, getMessaging(), uid, drawPayload(args));
    } catch {
      // best-effort: a push must never fail the callable
    }
  }

  const offerDraw = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    let opponentUid: string | null = null;
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as DrawDoc;
      const seat = callerSeat(doc, caller.uid);
      if (doc.status !== 'active') throw new HttpsError('failed-precondition', 'game is not active');
      if (doc.pendingDrawOffer) {
        throw new HttpsError('failed-precondition', 'a draw offer is already pending');
      }
      opponentUid = doc.players[seatKey(otherSeat(seat))] ?? null;
      appendMeta(tx, gameRef, doc, 'draw-offer', caller.uid, { pendingDrawOffer: seatKey(seat) });
    });
    await fireDrawOffered(db, opponentUid, { gameId, opponentName: caller.name });
    return { ok: true };
  });

  const respondDraw = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const accept = (request.data as { accept?: unknown })?.accept;
    if (typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'missing accept');
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    let opponentUid: string | null = null;
    let notifyAccept = false;
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as DrawDoc;
      const seat = callerSeat(doc, caller.uid);
      if (doc.status !== 'active') throw new HttpsError('failed-precondition', 'game is not active');
      if (!doc.pendingDrawOffer) {
        throw new HttpsError('failed-precondition', 'no draw offer pending');
      }
      if (doc.pendingDrawOffer === seatKey(seat)) {
        throw new HttpsError('failed-precondition', 'cannot respond to your own offer');
      }
      opponentUid = doc.players[seatKey(otherSeat(seat))] ?? null;
      appendMeta(tx, gameRef, doc, accept ? 'draw-accept' : 'draw-decline', caller.uid, {
        pendingDrawOffer: FieldValue.delete(),
        ...(accept ? { status: 'finished', result: 'draw', endedBy: 'draw-agreed' } : {}),
      });
      notifyAccept = accept;
    });
    if (notifyAccept) {
      await notify(db, opponentUid, 'game-over', {
        gameId,
        opponentName: caller.name,
        outcome: 'Draw agreed',
      });
    }
    return { ok: true };
  });

  return { offerDraw, respondDraw };
}
