// Game callables (T4.4, DESIGN §5.3): every game mutation happens here,
// validated with the same @hive/engine package the client runs (bundled in by
// esbuild — see the build script). Clients have no write access to games/* or
// invites/* (firestore.rules).
import { randomInt } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { notify } from './notify';
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
const DAY_MS = 24 * 60 * 60 * 1000;

function parseTimeControl(raw: unknown): { days: 1 | 3 | 7 } | null {
  if (raw === null || raw === undefined) return null;
  if (raw === 1 || raw === 3 || raw === 7) return { days: raw };
  throw new HttpsError('invalid-argument', 'timeControlDays must be 1, 3, 7 or null');
}

function deadlineFor(timeControl: { days: number } | null): Timestamp | null {
  return timeControl ? Timestamp.fromMillis(Date.now() + timeControl.days * DAY_MS) : null;
}
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
  const timeControl = parseTimeControl((request.data as { timeControlDays?: unknown })?.timeControlDays);

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
      inviteCode: code, // present while open — lets the creator re-share (DESIGN §5.2)
      toMove: 'w',
      turn: 1,
      moveCount: 0,
      timeControl,
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

// Direct challenge (DESIGN §5.3): no invite code — the game is addressed to a
// past opponent, who accepts/declines via respondChallenge. Both uids sit in
// playerIds from creation so the challenged player's lobby sees the open game.
export const challengeUser = onCall(async (request) => {
  const caller = requireAuth(request);
  const options = parseOptions((request.data as { options?: unknown })?.options);
  const colorRaw = (request.data as { color?: unknown })?.color;
  if (colorRaw !== 'w' && colorRaw !== 'b' && colorRaw !== 'random') {
    throw new HttpsError('invalid-argument', "color must be 'w' | 'b' | 'random'");
  }
  const color: Color = colorRaw === 'random' ? (randomInt(2) === 0 ? 'w' : 'b') : colorRaw;
  const timeControl = parseTimeControl((request.data as { timeControlDays?: unknown })?.timeControlDays);
  const opponentUid = (request.data as { opponentUid?: unknown })?.opponentUid;
  if (typeof opponentUid !== 'string' || opponentUid.length === 0) {
    throw new HttpsError('invalid-argument', 'missing opponentUid');
  }
  if (opponentUid === caller.uid) {
    throw new HttpsError('invalid-argument', 'cannot challenge yourself');
  }

  const db = getFirestore();
  // Only past opponents are challengeable: the caller and opponent must share
  // a game. The shared doc also supplies the opponent's display name (users/*
  // is private; playerNames is the denormalized source — DESIGN §5.2).
  const myGames = await db
    .collection('games')
    .where('playerIds', 'array-contains', caller.uid)
    .select('playerIds', 'players', 'playerNames')
    .get();
  let opponentName: string | null = null;
  for (const snap of myGames.docs) {
    const d = snap.data() as {
      playerIds: string[];
      players: { white: string | null; black: string | null };
      playerNames: { white: string | null; black: string | null };
    };
    if (!d.playerIds.includes(opponentUid)) continue;
    opponentName =
      (d.players.white === opponentUid ? d.playerNames.white : d.playerNames.black) ?? 'Player';
    break;
  }
  if (opponentName === null) {
    throw new HttpsError('failed-precondition', 'you can only challenge players from your games');
  }

  const gameRef = db.collection('games').doc();
  await gameRef.set({
    players: { white: color === 'w' ? caller.uid : null, black: color === 'b' ? caller.uid : null },
    playerNames: {
      white: color === 'w' ? caller.name : null,
      black: color === 'b' ? caller.name : null,
    },
    playerIds: [caller.uid, opponentUid],
    options,
    status: 'open',
    challenge: { from: caller.uid, fromName: caller.name, to: opponentUid, toName: opponentName },
    toMove: 'w',
    turn: 1,
    moveCount: 0,
    timeControl,
    state: serializeState(initialState(options)),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await notify(db, opponentUid, 'challenge-received', { gameId: gameRef.id, opponentName: caller.name });
  return { gameId: gameRef.id };
});

export const respondChallenge = onCall(async (request) => {
  const caller = requireAuth(request);
  const gameId = requireGameId(request.data);
  const accept = (request.data as { accept?: unknown })?.accept;
  if (typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'missing accept');

  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);
  let challengerUid: string | null = null;
  await db.runTransaction(async (tx) => {
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'game not found');
    const doc = game.data() as {
      status: string;
      players: { white: string | null; black: string | null };
      challenge?: { from: string; to: string };
      timeControl?: { days: number } | null;
    };
    if (doc.status !== 'open' || !doc.challenge) {
      throw new HttpsError('failed-precondition', 'no challenge pending on this game');
    }
    if (doc.challenge.to !== caller.uid) {
      throw new HttpsError('permission-denied', 'this challenge is not addressed to you');
    }
    challengerUid = doc.challenge.from;
    if (!accept) {
      tx.delete(gameRef); // no moves exist while open — the doc is the whole game
      return;
    }
    const seat: 'white' | 'black' = doc.players.white === null ? 'white' : 'black';
    tx.update(gameRef, {
      [`players.${seat}`]: caller.uid,
      [`playerNames.${seat}`]: caller.name,
      status: 'active',
      challenge: FieldValue.delete(),
      activatedBy: caller.uid, // fresh-game badge for the absent challenger (DESIGN §7)
      deadlineAt: deadlineFor(doc.timeControl ?? null),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await notify(db, challengerUid, accept ? 'challenge-accepted' : 'challenge-declined', {
    gameId,
    opponentName: caller.name,
  });
  return { gameId };
});

export const cancelGame = onCall(async (request) => {
  const caller = requireAuth(request);
  const gameId = requireGameId(request.data);
  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);
  await db.runTransaction(async (tx) => {
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'game not found');
    const data = game.data() as { status: string; playerIds: string[]; inviteCode?: string };
    if (!data.playerIds.includes(caller.uid)) {
      throw new HttpsError('permission-denied', 'not a player in this game');
    }
    if (data.status !== 'open') {
      throw new HttpsError('failed-precondition', 'only open games can be cancelled');
    }
    if (data.inviteCode) tx.delete(db.collection('invites').doc(data.inviteCode));
    tx.delete(gameRef); // no moves exist while open — the doc is the whole game
  });
  return { ok: true };
});

export const joinGame = onCall(async (request) => {
  const caller = requireAuth(request);
  const code = (request.data as { code?: unknown })?.code;
  if (typeof code !== 'string' || code.length === 0) {
    throw new HttpsError('invalid-argument', 'missing invite code');
  }

  const db = getFirestore();
  const inviteRef = db.collection('invites').doc(code);

  let creatorUid: string | null = null;
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
      timeControl?: { days: number } | null;
    };
    if (data.status !== 'open') throw new HttpsError('failed-precondition', 'game already started');
    if (data.playerIds.includes(caller.uid)) {
      throw new HttpsError('failed-precondition', 'cannot join your own game');
    }
    const seat: 'white' | 'black' = data.players.white === null ? 'white' : 'black';
    creatorUid = seat === 'white' ? data.players.black : data.players.white;
    tx.update(gameRef, {
      [`players.${seat}`]: caller.uid,
      [`playerNames.${seat}`]: caller.name,
      playerIds: FieldValue.arrayUnion(caller.uid),
      status: 'active',
      inviteCode: FieldValue.delete(),
      activatedBy: caller.uid, // fresh-game badge for the absent creator (DESIGN §7)
      deadlineAt: deadlineFor(data.timeControl ?? null),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(inviteRef);
    return inv.gameId;
  });

  await notify(db, creatorUid, 'game-joined', { gameId, opponentName: caller.name });
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

// ── meta actions (T4.5): typed entries in the same move log ────────────────

interface GameDocData {
  status: string;
  players: { white: string | null; black: string | null };
  playerNames: { white: string | null; black: string | null };
  playerIds: string[];
  options: GameOptions;
  moveCount: number;
  pendingDrawOffer?: 'white' | 'black';
  rematchGameId?: string;
}

function callerColor(doc: GameDocData, uid: string): Color {
  if (!doc.playerIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'not a player in this game');
  }
  return doc.players.white === uid ? 'w' : 'b';
}

function requireGameId(data: unknown): string {
  const gameId = (data as { gameId?: unknown })?.gameId;
  if (typeof gameId !== 'string' || gameId.length === 0) {
    throw new HttpsError('invalid-argument', 'missing gameId');
  }
  return gameId;
}

function appendMeta(
  tx: FirebaseFirestore.Transaction,
  gameRef: FirebaseFirestore.DocumentReference,
  doc: GameDocData,
  kind: 'resign' | 'draw-offer' | 'draw-accept' | 'draw-decline',
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

export const resign = onCall(async (request) => {
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
    opponentUid = color === 'w' ? doc.players.black : doc.players.white;
    appendMeta(tx, gameRef, doc, 'resign', caller.uid, {
      status: 'finished',
      result: color === 'w' ? 'black' : 'white',
      endedBy: 'resign',
      pendingDrawOffer: FieldValue.delete(),
    });
  });
  await notify(db, opponentUid, 'game-over', {
    gameId,
    opponentName: caller.name,
    outcome: `You won — ${caller.name} resigned`,
  });
  return { ok: true };
});

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

export const rematch = onCall(async (request) => {
  const caller = requireAuth(request);
  const gameId = requireGameId(request.data);
  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);
  const newRef = db.collection('games').doc();
  let opponentUid: string | null = null;
  const newId = await db.runTransaction(async (tx) => {
    const game = await tx.get(gameRef);
    if (!game.exists) throw new HttpsError('not-found', 'game not found');
    const doc = game.data() as GameDocData;
    callerColor(doc, caller.uid);
    if (doc.status !== 'finished') {
      throw new HttpsError('failed-precondition', 'rematch is only available after a game ends');
    }
    if (doc.rematchGameId) return doc.rematchGameId; // both players converge
    if (doc.players.white === null || doc.players.black === null) {
      throw new HttpsError('failed-precondition', 'game never had two players');
    }
    tx.set(newRef, {
      players: { white: doc.players.black, black: doc.players.white },
      playerNames: { white: doc.playerNames.black, black: doc.playerNames.white },
      playerIds: doc.playerIds,
      options: doc.options,
      status: 'active',
      toMove: 'w',
      turn: 1,
      moveCount: 0,
      state: serializeState(initialState(doc.options)),
      rematchOf: gameRef.id,
      activatedBy: caller.uid, // fresh-game badge for the offered-to player (DESIGN §7)
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(gameRef, { rematchGameId: newRef.id, updatedAt: FieldValue.serverTimestamp() });
    opponentUid = doc.players.white === caller.uid ? doc.players.black : doc.players.white;
    return newRef.id;
  });
  await notify(db, opponentUid, 'rematch-offered', { gameId: newId, opponentName: caller.name });
  return { gameId: newId };
});
