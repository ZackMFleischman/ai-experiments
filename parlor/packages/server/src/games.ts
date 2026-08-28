// ported from hive/packages/functions/src/games.ts (adapted)
// Shared game callables: every cross-game mutation (create / join / cancel /
// challenge / respond / rematch / resign) happens here, shaped by an injected
// GameServerConfig — seat naming, option validation, initial state (bags,
// racks, snapshots), and push copy are the game's. Clients have no write
// access to games/* or invites/* (the consumer's firestore.rules).
//
// Seats are N (2–4), not a pair: `seatKeys` is a list, `players` declares the
// range a game supports, and everything here indexes seats rather than naming
// two of them. A game that declares no range is a two-seat game and behaves
// exactly as it did before.
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
  /** Per-seat rack docs in seat order, written to racks/{uid} as seats fill
   * (hidden info — games without per-player secrets omit this and no rack docs
   * are written). One entry per seat dealt. */
  rackDocs?: readonly Record<string, unknown>[];
}

/**
 * How a game's turn order is decided (DECISIONS 2026-08-28 — three modes,
 * chosen at create and finalized in the game room, where `setTurnOrder`
 * persists it so every player sees the arrangement, not just the host).
 */
export type TurnOrderChoice =
  /** The creator takes this seat; everyone else fills in join order. */
  | { mode: 'host-seat'; seat: number }
  /** Shuffle the seats when the game starts. */
  | { mode: 'random' }
  /** An explicit arrangement: uids in turn order. */
  | { mode: 'arrange'; order: readonly string[] };

/**
 * What a game's `parseSeatChoice` may return. A bare number is an
 * already-resolved creator seat — which is what the two-seat wire values
 * ('me' → 0, 'them' → 1, 'random' → a coin flip) have always produced, so the
 * siblings' callable contracts are untouched.
 */
export type SeatChoice = TurnOrderChoice | number;

/** Lift a bare seat index into the modern choice shape. */
export function normalizeTurnOrder(choice: SeatChoice): TurnOrderChoice {
  return typeof choice === 'number' ? { mode: 'host-seat', seat: choice } : choice;
}

export interface GameServerConfig<TOptions> {
  /** Seat keys in move order — seat 0 moves first (e.g. ['p0', 'p1']).
   * `toMove` and `result` use these same keys. Must hold at least
   * `players.max` entries. */
  seatKeys: readonly string[];
  /** Seat counts this game supports. Omit for a two-seat game — the default
   * `{min: 2, max: 2}` is what every game shipped before M7. */
  players?: { min: number; max: number };
  /** Validate + normalize client-sent options (throw HttpsError when bad). */
  parseOptions(raw: unknown): TOptions;
  /** The creator's turn-order choice off the wire. Returning a bare seat index
   * is the two-seat form and still supported (see SeatChoice). */
  parseSeatChoice(raw: unknown): SeatChoice;
  /** Async time control read out of the parsed options (null = no clock). */
  timeControlDays(options: TOptions): 1 | 3 | 7 | null;
  /** Fresh game-specific state for `playerCount` seats. Runs inside the
   * create/challenge/rematch transaction; randomness (bag shuffles) is the
   * game's own. Parlor always passes the count; two-seat games may ignore it. */
  initialGame(options: TOptions, playerCount: number): InitialGame;
  /** Re-derive a seat's initial rack doc when its seat fills at join/accept
   * time (no moves exist while a game is open, so the initial deal is still
   * current). May tx.get() — parlor calls this before any transaction write.
   * Omit for games without hidden racks. */
  seatRackDoc?(
    tx: Transaction,
    gameRef: DocumentReference,
    game: DocumentData,
    seatIndex: number,
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
  const SEATS = config.seatKeys;
  const PLAYERS = config.players ?? { min: 2, max: 2 };
  if (SEATS.length < PLAYERS.max) {
    throw new Error(
      `misconfigured game: seatKeys holds ${SEATS.length} seats but players.max is ${PLAYERS.max}`,
    );
  }
  const SEAT0 = SEATS[0]!;
  const notify = createNotify(config.notify);

  const seatKey = (i: number): string => {
    const key = SEATS[i];
    if (key === undefined) throw new HttpsError('internal', `this game has no seat ${i}`);
    return key;
  };

  /** The seat keys this game doc actually dealt, in move order. */
  const seatsOf = (doc: Pick<GameDocData, 'players'>): string[] =>
    SEATS.filter((key) => key in doc.players);

  function callerSeatIndex(doc: GameDocData, uid: string): number {
    if (!doc.playerIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'not a player in this game');
    }
    const seat = seatsOf(doc).findIndex((key) => doc.players[key] === uid);
    if (seat === -1) throw new HttpsError('permission-denied', 'not seated in this game');
    return seat;
  }

  function callerSeatKey(doc: GameDocData, uid: string): string {
    return seatKey(callerSeatIndex(doc, uid));
  }

  /**
   * Which seat the creator takes. 'random' and 'arrange' are resolved when the
   * game starts (3+ seats, T7.6); at two seats the game's own parseSeatChoice
   * has already flipped the coin, so it arrives here as a seat index.
   */
  function creatorSeatFrom(choice: SeatChoice, seats: number): number {
    const turnOrder = normalizeTurnOrder(choice);
    if (turnOrder.mode !== 'host-seat') return 0;
    if (!Number.isInteger(turnOrder.seat) || turnOrder.seat < 0 || turnOrder.seat >= seats) {
      throw new HttpsError('invalid-argument', `seat ${turnOrder.seat} is not a seat in this game`);
    }
    return turnOrder.seat;
  }

  /** Base doc for a fresh game (create / challenge / rematch share it). */
  function baseGameDoc(
    creator: Caller,
    creatorSeat: number,
    options: TOptions,
    init: InitialGame,
    seats: number,
  ): Record<string, unknown> {
    const timeControlDays = config.timeControlDays(options);
    const players: Record<string, string | null> = {};
    const playerNames: Record<string, string | null> = {};
    for (let i = 0; i < seats; i++) {
      players[seatKey(i)] = i === creatorSeat ? creator.uid : null;
      playerNames[seatKey(i)] = i === creatorSeat ? creator.name : null;
    }
    return {
      players,
      playerNames,
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

  /** Deal `uid` its opening rack, when the game has per-seat secrets. */
  function writeRack(
    tx: Transaction,
    gameRef: DocumentReference,
    init: InitialGame,
    seat: number,
    uid: string,
  ): void {
    const rack = init.rackDocs?.[seat];
    if (rack) tx.set(gameRef.collection('racks').doc(uid), rack);
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
    const seats = PLAYERS.max;
    const creatorSeat = creatorSeatFrom(
      config.parseSeatChoice((request.data as { seat?: unknown })?.seat),
      seats,
    );

    const db = getFirestore();
    const gameRef = db.collection('games').doc();
    const code = makeCode();
    const inviteRef = db.collection('invites').doc(code);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(inviteRef);
      if (existing.exists) throw new HttpsError('aborted', 'invite collision, retry');
      const init = config.initialGame(options, seats);
      tx.set(gameRef, {
        ...baseGameDoc(caller, creatorSeat, options, init, seats),
        inviteCode: code, // present while open — lets the creator re-share
      });
      writeInitialSubDocs(tx, gameRef, init);
      writeRack(tx, gameRef, init, creatorSeat, caller.uid);
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
    const seats = PLAYERS.max;
    const creatorSeat = creatorSeatFrom(
      config.parseSeatChoice((request.data as { seat?: unknown })?.seat),
      seats,
    );
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
      const theirSeat = SEATS.find((key) => d.players[key] === opponentUid);
      opponentName = (theirSeat ? d.playerNames[theirSeat] : null) ?? 'Player';
      break;
    }
    if (opponentName === null) {
      throw new HttpsError('failed-precondition', 'you can only challenge players from your games');
    }

    const gameRef = db.collection('games').doc();
    await db.runTransaction(async (tx) => {
      const init = config.initialGame(options, seats);
      tx.set(gameRef, {
        ...baseGameDoc(caller, creatorSeat, options, init, seats),
        playerIds: [caller.uid, opponentUid],
        challenge: { from: caller.uid, fromName: caller.name, to: opponentUid, toName: opponentName },
      });
      writeInitialSubDocs(tx, gameRef, init);
      writeRack(tx, gameRef, init, creatorSeat, caller.uid);
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
      const openSeat = seatsOf(doc).findIndex((key) => doc.players[key] === null);
      if (openSeat === -1) throw new HttpsError('failed-precondition', 'no seat is open');
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
      const openSeat = seatsOf(data).findIndex((key) => data.players[key] === null);
      if (openSeat === -1) throw new HttpsError('failed-precondition', 'game is full');
      // T7.5 turns this into a roster append; while every game is two-seat the
      // only other seat holds the creator.
      creatorUid = seatsOf(data).map((key) => data.players[key]).find((uid) => uid) ?? null;
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
      const seatIndex = callerSeatIndex(doc, caller.uid);
      if (doc.status !== 'active') {
        throw new HttpsError('failed-precondition', 'game is not active');
      }
      // Terminal at two seats. T7.7 makes this a WITHDRAWAL at three or four
      // (the leaver's score freezes and play continues) and T7.8 fans the push
      // out to every remaining player.
      const winnerSeat = seatKey(seatIndex === 0 ? 1 : 0);
      opponentUid = doc.players[winnerSeat] ?? null;
      tx.set(gameRef.collection('moves').doc(String(doc.moveCount)), {
        n: doc.moveCount,
        kind: 'resign',
        by: caller.uid,
        at: FieldValue.serverTimestamp(),
      });
      tx.update(gameRef, {
        moveCount: doc.moveCount + 1,
        status: 'finished',
        result: winnerSeat,
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
      const seatKeysUsed = seatsOf(doc);
      const previous = seatKeysUsed.map((key) => doc.players[key] ?? null);
      if (previous.some((uid) => uid === null)) {
        throw new HttpsError('failed-precondition', 'game never had a full table');
      }
      const options = config.parseOptions(doc.options);
      const init = config.initialGame(options, seatKeysUsed.length);
      // Rematch ROTATES the order by one so the opening advantage circulates
      // (at two seats that is exactly the swap it has always been).
      const rotated = [...previous.slice(1), previous[0]!];
      const rotatedNames = [...seatKeysUsed.slice(1), seatKeysUsed[0]!].map(
        (key) => doc.playerNames[key] ?? null,
      );
      const players: Record<string, string | null> = {};
      const playerNames: Record<string, string | null> = {};
      seatKeysUsed.forEach((key, i) => {
        players[key] = rotated[i]!;
        playerNames[key] = rotatedNames[i] ?? null;
      });
      tx.set(newRef, {
        players,
        playerNames,
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
      rotated.forEach((uid, i) => writeRack(tx, newRef, init, i, uid!));
      tx.update(gameRef, { rematchGameId: newRef.id, updatedAt: FieldValue.serverTimestamp() });
      opponentUid = rotated.find((uid) => uid !== caller.uid) ?? null;
      return newRef.id;
    });
    await notify(db, opponentUid, 'rematch-offered', { gameId: newId, opponentName: caller.name });
    return { gameId: newId };
  });

  return { createGame, joinGame, cancelGame, challengeUser, respondChallenge, rematch, resign };
}
