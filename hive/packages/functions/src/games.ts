// Game callables (T4.4, DESIGN §5.3): every game mutation happens here,
// validated with the same @hive/engine package the client runs (bundled in by
// esbuild — see the build script). Clients have no write access to games/* or
// invites/* (firestore.rules).
import { randomInt } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import {
  IllegalMoveError,
  applyMove,
  deserializeState,
  initialState,
  parseUhp,
  result,
  serializeState,
  toUhp,
  type Color,
  type GameOptions,
} from '@hive/engine';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// No lookalikes (0/O, 1/I): codes read well off a phone screen.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface Caller {
  uid: string;
  name: string;
}

function requireAuth(request: CallableRequest): Caller {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const token = request.auth.token as { name?: string; email?: string };
  const name = token.name ?? token.email?.split('@')[0] ?? 'Player';
  return { uid: request.auth.uid, name };
}

function parseOptions(raw: unknown): GameOptions {
  const o = raw as Partial<Record<keyof GameOptions, unknown>> | null;
  const keys: Array<keyof GameOptions> = ['mosquito', 'ladybug', 'pillbug', 'tournamentOpening'];
  if (!o || keys.some((k) => typeof o[k] !== 'boolean')) {
    throw new HttpsError('invalid-argument', 'malformed game options');
  }
  return {
    mosquito: o.mosquito as boolean,
    ladybug: o.ladybug as boolean,
    pillbug: o.pillbug as boolean,
    tournamentOpening: o.tournamentOpening as boolean,
  };
}

function makeCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const createGame = onCall(async (request) => {
  const caller = requireAuth(request);
  const options = parseOptions((request.data as { options?: unknown })?.options);
  const colorRaw = (request.data as { color?: unknown })?.color;
  if (colorRaw !== 'w' && colorRaw !== 'b' && colorRaw !== 'random') {
    throw new HttpsError('invalid-argument', "color must be 'w' | 'b' | 'random'");
  }
  const color: Color = colorRaw === 'random' ? (randomInt(2) === 0 ? 'w' : 'b') : colorRaw;

  const db = getFirestore();
  const gameRef = db.collection('games').doc();
  const code = makeCode();
  const inviteRef = db.collection('invites').doc(code);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(inviteRef);
    if (existing.exists) throw new HttpsError('aborted', 'invite collision, retry');
    tx.set(gameRef, {
      players: { white: color === 'w' ? caller.uid : null, black: color === 'b' ? caller.uid : null },
      playerNames: {
        white: color === 'w' ? caller.name : null,
        black: color === 'b' ? caller.name : null,
      },
      playerIds: [caller.uid],
      options,
      status: 'open',
      toMove: 'w',
      turn: 1,
      moveCount: 0,
      state: serializeState(initialState(options)),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(inviteRef, {
      gameId: gameRef.id,
      createdBy: caller.uid,
      hostName: caller.name,
      hostColor: color,
      options,
      expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
    });
  });

  return { gameId: gameRef.id, code };
});

export const joinGame = onCall(async (request) => {
  const caller = requireAuth(request);
  const code = (request.data as { code?: unknown })?.code;
  if (typeof code !== 'string' || code.length === 0) {
    throw new HttpsError('invalid-argument', 'missing invite code');
  }

  const db = getFirestore();
  const inviteRef = db.collection('invites').doc(code);

  const gameId = await db.runTransaction(async (tx) => {
    const invite = await tx.get(inviteRef);
    if (!invite.exists) throw new HttpsError('not-found', 'invite not found');
    const inv = invite.data() as { gameId: string; expiresAt: Timestamp };
    if (inv.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('not-found', 'invite expired');
    }
    const gameRef = db.collection('games').doc(inv.gameId);
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'game not found');
    const data = game.data() as {
      status: string;
      players: { white: string | null; black: string | null };
      playerIds: string[];
    };
    if (data.status !== 'open') throw new HttpsError('failed-precondition', 'game already started');
    if (data.playerIds.includes(caller.uid)) {
      throw new HttpsError('failed-precondition', 'cannot join your own game');
    }
    const seat: 'white' | 'black' = data.players.white === null ? 'white' : 'black';
    tx.update(gameRef, {
      [`players.${seat}`]: caller.uid,
      [`playerNames.${seat}`]: caller.name,
      playerIds: FieldValue.arrayUnion(caller.uid),
      status: 'active',
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(inviteRef);
    return inv.gameId;
  });

  return { gameId };
});

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

    const outcome = result(next);
    const terminal =
      outcome.status === 'won'
        ? { status: 'finished', result: outcome.winner === 'w' ? 'white' : 'black', endedBy: 'surround' }
        : outcome.status === 'draw'
          ? { status: 'finished', result: 'draw', endedBy: outcome.by }
          : null;

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
      updatedAt: FieldValue.serverTimestamp(),
      ...(terminal ?? {}),
    });
    return expectedMoveCount + 1;
  });

  return { moveCount };
});
