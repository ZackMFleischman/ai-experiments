// ported from hive/packages/functions/src/games.ts (adapted)
// Shared game callables: every cross-game mutation (create / join / cancel /
// challenge / respond / rematch / resign) happens here, shaped by an injected
// GameServerConfig — seat naming, option validation, initial state (bags,
// racks, snapshots), and push copy are the game's. Clients have no write
// access to games/* or invites/* (the consumer's firestore.rules).
import { randomInt } from 'node:crypto';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableFunction } from 'firebase-functions/v2/https';
import {
  INVITE_TTL_MS,
  deadlineFor,
  makeCode,
  requireAuth,
  requireGameId,
  type Caller,
} from './helpers';
import { createNotify, type NotifyConfig } from './notify';

export interface InitialGame {
  /** Game-specific top-level doc fields (scores, counts, public snapshot…). */
  fields: Record<string, unknown>;
  /** Server-private subdocuments, e.g. [['private', 'bag'], {...}]. */
  subDocs: ReadonlyArray<{
    path: readonly [collection: string, docId: string];
    data: Record<string, unknown>;
  }>;
  /** Per-seat rack docs, written to racks/{uid} as seats fill (hidden info —
   * games without per-player secrets return two empty objects and no rack
   * docs are written). */
  rackDocs?: readonly [Record<string, unknown>, Record<string, unknown>];
}

export interface GameServerConfig<TOptions> {
  /** Seat keys in move order — seat 0 moves first (e.g. ['p0', 'p1']).
   * `toMove` and `result` use these same keys. */
  seatKeys: readonly [string, string];
  /** Validate + normalize client-sent options (throw HttpsError when bad). */
  parseOptions(raw: unknown): TOptions;
  /** Creator's seat index from the client's seat / turn-order choice. */
  parseSeatChoice(raw: unknown): 0 | 1;
  /** Async time control read out of the parsed options (null = no clock). */
  timeControlDays(options: TOptions): 1 | 3 | 7 | null;
  /** Fresh game-specific state. Runs inside the create/challenge/rematch
   * transaction; randomness (bag shuffles) is the game's own. */
  initialGame(options: TOptions): InitialGame;
  /** Re-derive a seat's initial rack doc when its seat fills at join/accept
   * time (no moves exist while a game is open, so the initial deal is still
   * current). May tx.get() — parlor calls this before any transaction write.
   * Omit for games without hidden racks. */
  seatRackDoc?(
    tx: Transaction,
    gameRef: DocumentReference,
    game: DocumentData,
    seatIndex: 0 | 1,
  ): Promise<Record<string, unknown>>;
  notify: NotifyConfig;
}

interface GameDocData extends DocumentData {
  status: string;
  players: Record<string, string | null>;
  playerNames: Record<string, string | null>;
  playerIds: string[];
  options: unknown;
  moveCount: number;
  inviteCode?: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
  rematchGameId?: string;
  timeControl?: { days: number } | null;
}

export interface GameCallables {
  createGame: CallableFunction<unknown, unknown>;
  joinGame: CallableFunction<unknown, unknown>;
  cancelGame: CallableFunction<unknown, unknown>;
  challengeUser: CallableFunction<unknown, unknown>;
  respondChallenge: CallableFunction<unknown, unknown>;
  rematch: CallableFunction<unknown, unknown>;
  resign: CallableFunction<unknown, unknown>;
}

export function createGameCallables<TOptions>(config: GameServerConfig<TOptions>): GameCallables {
  const [SEAT0, SEAT1] = config.seatKeys;
  const notify = createNotify(config.notify);

  const seatKey = (i: 0 | 1) => (i === 0 ? SEAT0 : SEAT1);

  function callerSeatKey(doc: GameDocData, uid: string): string {
    if (!doc.playerIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'not a player in this game');
    }
    return doc.players[SEAT0] === uid ? SEAT0 : SEAT1;
  }

  /** Base doc for a fresh game (create / challenge / rematch share it). */
  function baseGameDoc(
    creator: Caller,
    creatorSeat: 0 | 1,
    options: TOptions,
    init: InitialGame,
  ): Record<string, unknown> {
    const timeControlDays = config.timeControlDays(options);
    return {
      players: {
        [seatKey(creatorSeat)]: creator.uid,
        [seatKey(creatorSeat === 0 ? 1 : 0)]: null,
      },
      playerNames: {
        [seatKey(creatorSeat)]: creator.name,
        [seatKey(creatorSeat === 0 ? 1 : 0)]: null,
      },
      playerIds: [creator.uid],
      options,
      status: 'open',
      toMove: SEAT0,
      moveCount: 0,
      timeControl: timeControlDays ? { days: timeControlDays } : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...init.fields,
    };
  }

  function writeInitialSubDocs(
    tx: Transaction,
    gameRef: DocumentReference,
    init: InitialGame,
  ): void {
    for (const sub of init.subDocs) {
      tx.set(gameRef.collection(sub.path[0]).doc(sub.path[1]), sub.data);
    }
  }

  const createGame = onCall(async (request) => {
    const caller = requireAuth(request);
    const options = config.parseOptions((request.data as { options?: unknown })?.options);
    const creatorSeat = config.parseSeatChoice((request.data as { seat?: unknown })?.seat);

    const db = getFirestore();
    const gameRef = db.collection('games').doc();
    const code = makeCode();
    const inviteRef = db.collection('invites').doc(code);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(inviteRef);
      if (existing.exists) throw new HttpsError('aborted', 'invite collision, retry');
      const init = config.initialGame(options);
      tx.set(gameRef, {
        ...baseGameDoc(caller, creatorSeat, options, init),
        inviteCode: code, // present while open — lets the creator re-share
      });
      writeInitialSubDocs(tx, gameRef, init);
      if (init.rackDocs) {
        tx.set(gameRef.collection('racks').doc(caller.uid), init.rackDocs[creatorSeat]);
      }
      tx.set(inviteRef, {
        gameId: gameRef.id,
        createdBy: caller.uid,
        hostName: caller.name,
        hostSeat: seatKey(creatorSeat),
        options,
        expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
      });
    });

    return { gameId: gameRef.id, code };
  });

  // Direct challenge: no invite code — the game is addressed to a past
  // opponent, who accepts/declines via respondChallenge. Both uids sit in
  // playerIds from creation so the challenged player's lobby sees it.
  const challengeUser = onCall(async (request) => {
    const caller = requireAuth(request);
    const options = config.parseOptions((request.data as { options?: unknown })?.options);
    const creatorSeat = config.parseSeatChoice((request.data as { seat?: unknown })?.seat);
    const opponentUid = (request.data as { opponentUid?: unknown })?.opponentUid;
    if (typeof opponentUid !== 'string' || opponentUid.length === 0) {
      throw new HttpsError('invalid-argument', 'missing opponentUid');
    }
    if (opponentUid === caller.uid) {
      throw new HttpsError('invalid-argument', 'cannot challenge yourself');
    }

    const db = getFirestore();
    // Only past opponents are challengeable: the caller and opponent must
    // share a game. The shared doc also supplies the opponent's display name
    // (users/* is private; playerNames is the denormalized source).
    const myGames = await db
      .collection('games')
      .where('playerIds', 'array-contains', caller.uid)
      .select('playerIds', 'players', 'playerNames')
      .get();
    let opponentName: string | null = null;
    for (const snap of myGames.docs) {
      const d = snap.data() as Pick<GameDocData, 'playerIds' | 'players' | 'playerNames'>;
      if (!d.playerIds.includes(opponentUid)) continue;
      opponentName =
        (d.players[SEAT0] === opponentUid ? d.playerNames[SEAT0] : d.playerNames[SEAT1]) ??
        'Player';
      break;
    }
    if (opponentName === null) {
      throw new HttpsError('failed-precondition', 'you can only challenge players from your games');
    }

    const gameRef = db.collection('games').doc();
    await db.runTransaction(async (tx) => {
      const init = config.initialGame(options);
      tx.set(gameRef, {
        ...baseGameDoc(caller, creatorSeat, options, init),
        playerIds: [caller.uid, opponentUid],
        challenge: { from: caller.uid, fromName: caller.name, to: opponentUid, toName: opponentName },
      });
      writeInitialSubDocs(tx, gameRef, init);
      if (init.rackDocs) {
        tx.set(gameRef.collection('racks').doc(caller.uid), init.rackDocs[creatorSeat]);
      }
    });

    await notify(db, opponentUid, 'challenge-received', {
      gameId: gameRef.id,
      opponentName: caller.name,
    });
    return { gameId: gameRef.id };
  });

  const respondChallenge = onCall(async (request) => {
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
      const doc = game.data() as GameDocData;
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
      const openSeat: 0 | 1 = doc.players[SEAT0] === null ? 0 : 1;
      const rack = config.seatRackDoc
        ? await config.seatRackDoc(tx, gameRef, doc, openSeat)
        : null;
      tx.update(gameRef, {
        [`players.${seatKey(openSeat)}`]: caller.uid,
        [`playerNames.${seatKey(openSeat)}`]: caller.name,
        status: 'active',
        challenge: FieldValue.delete(),
        activatedBy: caller.uid, // fresh-game badge for the absent challenger
        deadlineAt: deadlineFor(doc.timeControl ?? null),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (rack) tx.set(gameRef.collection('racks').doc(caller.uid), rack);
    });

    await notify(db, challengerUid, accept ? 'challenge-accepted' : 'challenge-declined', {
      gameId,
      opponentName: caller.name,
    });
    return { gameId };
  });

  const cancelGame = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const data = game.data() as GameDocData;
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

  const joinGame = onCall(async (request) => {
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
      const data = game.data() as GameDocData;
      if (data.status !== 'open') {
        throw new HttpsError('failed-precondition', 'game already started');
      }
      if (data.playerIds.includes(caller.uid)) {
        throw new HttpsError('failed-precondition', 'cannot join your own game');
      }
      const openSeat: 0 | 1 = data.players[SEAT0] === null ? 0 : 1;
      creatorUid = data.players[seatKey(openSeat === 0 ? 1 : 0)] ?? null;
      const rack = config.seatRackDoc
        ? await config.seatRackDoc(tx, gameRef, data, openSeat)
        : null;
      tx.update(gameRef, {
        [`players.${seatKey(openSeat)}`]: caller.uid,
        [`playerNames.${seatKey(openSeat)}`]: caller.name,
        playerIds: FieldValue.arrayUnion(caller.uid),
        status: 'active',
        inviteCode: FieldValue.delete(),
        activatedBy: caller.uid, // fresh-game badge for the absent creator
        deadlineAt: deadlineFor(data.timeControl ?? null),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (rack) tx.set(gameRef.collection('racks').doc(caller.uid), rack);
      tx.delete(inviteRef);
      return inv.gameId;
    });

    await notify(db, creatorUid, 'game-joined', { gameId, opponentName: caller.name });
    return { gameId };
  });

  const resign = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    let opponentUid: string | null = null;
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as GameDocData;
      const seat = callerSeatKey(doc, caller.uid);
      if (doc.status !== 'active') {
        throw new HttpsError('failed-precondition', 'game is not active');
      }
      opponentUid = (seat === SEAT0 ? doc.players[SEAT1] : doc.players[SEAT0]) ?? null;
      tx.set(gameRef.collection('moves').doc(String(doc.moveCount)), {
        n: doc.moveCount,
        kind: 'resign',
        by: caller.uid,
        at: FieldValue.serverTimestamp(),
      });
      tx.update(gameRef, {
        moveCount: doc.moveCount + 1,
        status: 'finished',
        result: seat === SEAT0 ? SEAT1 : SEAT0,
        endedBy: 'resign',
        deadlineAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await notify(db, opponentUid, 'game-over', {
      gameId,
      opponentName: caller.name,
      outcome: `You won — ${caller.name} resigned`,
    });
    return { ok: true };
  });

  const rematch = onCall(async (request) => {
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
      callerSeatKey(doc, caller.uid);
      if (doc.status !== 'finished') {
        throw new HttpsError('failed-precondition', 'rematch is only available after a game ends');
      }
      if (doc.rematchGameId) return doc.rematchGameId; // both players converge
      const prev0 = doc.players[SEAT0];
      const prev1 = doc.players[SEAT1];
      if (prev0 === null || prev1 === null || prev0 === undefined || prev1 === undefined) {
        throw new HttpsError('failed-precondition', 'game never had two players');
      }
      const options = config.parseOptions(doc.options);
      const init = config.initialGame(options);
      // Rematch swaps who starts: last game's seat-1 player opens this one.
      tx.set(newRef, {
        players: { [SEAT0]: prev1, [SEAT1]: prev0 },
        playerNames: { [SEAT0]: doc.playerNames[SEAT1], [SEAT1]: doc.playerNames[SEAT0] },
        playerIds: doc.playerIds,
        options,
        status: 'active',
        toMove: SEAT0,
        moveCount: 0,
        timeControl: doc.timeControl ?? null,
        deadlineAt: deadlineFor(doc.timeControl ?? null),
        rematchOf: gameRef.id,
        activatedBy: caller.uid, // fresh-game badge for the offered-to player
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...init.fields,
      });
      writeInitialSubDocs(tx, newRef, init);
      if (init.rackDocs) {
        tx.set(newRef.collection('racks').doc(prev1), init.rackDocs[0]);
        tx.set(newRef.collection('racks').doc(prev0), init.rackDocs[1]);
      }
      tx.update(gameRef, { rematchGameId: newRef.id, updatedAt: FieldValue.serverTimestamp() });
      opponentUid = prev0 === caller.uid ? prev1 : prev0;
      return newRef.id;
    });
    await notify(db, opponentUid, 'rematch-offered', { gameId: newId, opponentName: caller.name });
    return { gameId: newId };
  });

  return { createGame, joinGame, cancelGame, challengeUser, respondChallenge, rematch, resign };
}
