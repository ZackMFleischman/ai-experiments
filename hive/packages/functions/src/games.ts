// Game-specific callables (DESIGN §5.3): the mutations that stay hive's because
// they don't fit @parlor/server's generic shape —
//   • submitMove: runs the @hive/engine verdict pipeline over the full state.
//   • offerDraw / respondDraw: draw offers are a hive concept.
// Everything generic (create / join / cancel / challenge / respond / rematch /
// resign) is a @parlor/server shell shaped by config.ts (see index.ts). Clients
// have no write access to games/* or invites/* (firestore.rules).
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { deadlineFor, requireAuth, requireGameId } from '@parlor/server';
import { notify } from './notify';
import {
  IllegalMoveError,
  applyMove,
  deserializeState,
  parseUhp,
  result,
  serializeState,
  toUhp,
  type Color,
  type GameOptions,
} from '@hive/engine';

export const submitMove = onCall(async (request) => {
  const caller = requireAuth(request);
  const data = request.data as {
    gameId?: unknown;
    expectedMoveCount?: unknown;
    uhpMove?: unknown;
  };
  if (
    typeof data?.gameId !== 'string' ||
    typeof data?.expectedMoveCount !== 'number' ||
    typeof data?.uhpMove !== 'string'
  ) {
    throw new HttpsError('invalid-argument', 'expected {gameId, expectedMoveCount, uhpMove}');
  }
  const { gameId, expectedMoveCount, uhpMove } = data as {
    gameId: string;
    expectedMoveCount: number;
    uhpMove: string;
  };

  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);

  let recipientUid: string | null = null;
  let recipientOutcome: string | null = null;
  const moveCount = await db.runTransaction(async (tx) => {
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'game not found');
    const doc = game.data() as {
      status: string;
      players: { white: string | null; black: string | null };
      playerIds: string[];
      toMove: Color;
      moveCount: number;
      state: string;
      timeControl?: { days: number } | null;
    };
    if (!doc.playerIds.includes(caller.uid)) {
      throw new HttpsError('permission-denied', 'not a player in this game');
    }
    if (doc.status !== 'active') throw new HttpsError('failed-precondition', 'game is not active');
    if (doc.moveCount !== expectedMoveCount) {
      throw new HttpsError('failed-precondition', `stale expectedMoveCount (game is at ${doc.moveCount})`);
    }
    const myColor: Color = doc.players.white === caller.uid ? 'w' : 'b';
    if (doc.toMove !== myColor) throw new HttpsError('failed-precondition', 'not your turn');

    const state = deserializeState(doc.state);
    let next;
    let canonical: string;
    let kind: 'move' | 'pass';
    try {
      const move = parseUhp(uhpMove, state);
      canonical = toUhp(move, state);
      kind = move.type === 'pass' ? 'pass' : 'move';
      next = applyMove(state, move);
    } catch (err) {
      if (err instanceof IllegalMoveError || err instanceof Error) {
        throw new HttpsError('invalid-argument', `illegal move: ${(err as Error).message}`);
      }
      throw err;
    }

    recipientUid = myColor === 'w' ? doc.players.black : doc.players.white;
    const outcome = result(next);
    const terminal =
      outcome.status === 'won'
        ? { status: 'finished', result: outcome.winner === 'w' ? 'white' : 'black', endedBy: 'surround' }
        : outcome.status === 'draw'
          ? { status: 'finished', result: 'draw', endedBy: outcome.by }
          : null;

    if (terminal) {
      const recipientColor = myColor === 'w' ? 'black' : 'white';
      recipientOutcome =
        terminal.result === 'draw' ? 'Draw' : terminal.result === recipientColor ? 'You won!' : 'You lost';
    }
    tx.set(gameRef.collection('moves').doc(String(expectedMoveCount)), {
      n: expectedMoveCount,
      kind,
      uhp: canonical,
      by: caller.uid,
      at: FieldValue.serverTimestamp(),
    });
    tx.update(gameRef, {
      state: serializeState(next),
      toMove: next.toMove,
      turn: next.turn,
      moveCount: expectedMoveCount + 1,
      pendingDrawOffer: FieldValue.delete(),
      deadlineAt: terminal ? null : deadlineFor(doc.timeControl ?? null),
      deadlineWarnedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(terminal ?? {}),
    });
    return expectedMoveCount + 1;
  });

  await notify(db, recipientUid, recipientOutcome ? 'game-over' : 'opponent-moved', {
    gameId,
    opponentName: caller.name,
    ...(recipientOutcome ? { outcome: recipientOutcome } : {}),
  });
  return { moveCount };
});

// ── draw offers (T4.5): typed meta entries in the same move log ────────────

interface GameDocData {
  status: string;
  players: { white: string | null; black: string | null };
  playerNames: { white: string | null; black: string | null };
  playerIds: string[];
  options: GameOptions;
  moveCount: number;
  pendingDrawOffer?: 'white' | 'black';
}

function callerColor(doc: GameDocData, uid: string): Color {
  if (!doc.playerIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'not a player in this game');
  }
  return doc.players.white === uid ? 'w' : 'b';
}

function appendMeta(
  tx: FirebaseFirestore.Transaction,
  gameRef: FirebaseFirestore.DocumentReference,
  doc: GameDocData,
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

export const offerDraw = onCall(async (request) => {
  const caller = requireAuth(request);
  const gameId = requireGameId(request.data);
  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);
  let opponentUid: string | null = null;
  await db.runTransaction(async (tx) => {
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'game not found');
    const doc = game.data() as GameDocData;
    const color = callerColor(doc, caller.uid);
    if (doc.status !== 'active') throw new HttpsError('failed-precondition', 'game is not active');
    if (doc.pendingDrawOffer) {
      throw new HttpsError('failed-precondition', 'a draw offer is already pending');
    }
    opponentUid = color === 'w' ? doc.players.black : doc.players.white;
    appendMeta(tx, gameRef, doc, 'draw-offer', caller.uid, {
      pendingDrawOffer: color === 'w' ? 'white' : 'black',
    });
  });
  await notify(db, opponentUid, 'draw-offered', { gameId, opponentName: caller.name });
  return { ok: true };
});

export const respondDraw = onCall(async (request) => {
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
    const doc = game.data() as GameDocData;
    const color = callerColor(doc, caller.uid);
    if (doc.status !== 'active') throw new HttpsError('failed-precondition', 'game is not active');
    const pendingColor = doc.pendingDrawOffer === 'white' ? 'w' : doc.pendingDrawOffer === 'black' ? 'b' : undefined;
    if (!pendingColor) throw new HttpsError('failed-precondition', 'no draw offer pending');
    if (pendingColor === color) {
      throw new HttpsError('failed-precondition', 'cannot respond to your own offer');
    }
    opponentUid = color === 'w' ? doc.players.black : doc.players.white;
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
