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
import { createNotify, createNotifyRoom, type NotifyConfig } from './notify';
import { withdrawInTx, type WithdrawResult } from './withdraw';
import {
  declineInvite,
  emptyGuestList,
  guestListOf,
  inviteToList,
  joinRoster,
  leaveList,
  playerIdsOf,
  previewOf,
  normalizeTurnOrder,
  parseTurnOrderChoice,
  resolveSeatOrder,
  type GuestList,
  type RosterEntry,
  type SeatChoice,
  type TurnOrderChoice,
} from './roster';

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
  /** How many seats THIS game will hold, read from its parsed options — the
   * host's chosen maximum (DECISIONS 2026-08-28: the count is a maximum, not a
   * fixed size). Defaults to `players.max`; a two-seat game never needs it. */
  maxPlayers?(options: TOptions): number;
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
  /**
   * Take a seat out of a running 3+ game (DECISIONS 2026-08-28 — a resign or
   * timeout at three or four players is a WITHDRAWAL, not a game end). May
   * `tx.get()` before returning; parlor performs every write after. Omit it and
   * a game stays terminal-on-resign at every seat count.
   */
  withdrawSeat?(ctx: {
    tx: Transaction;
    gameRef: DocumentReference;
    doc: DocumentData;
    seat: number;
  }): Promise<WithdrawResult> | WithdrawResult;
  notify: NotifyConfig;
}

interface GameDocData extends DocumentData {
  status: string;
  players: Record<string, string | null>;
  playerNames: Record<string, string | null>;
  playerIds: string[];
  options: unknown;
  moveCount: number;
  /** Present only on a 3+ game: the host's chosen maximum. Its presence is
   * what makes a game a guest-list game — two-seat docs are untouched. */
  maxPlayers?: number;
  roster?: RosterEntry[];
  invited?: RosterEntry[];
  declined?: RosterEntry[];
  turnOrder?: TurnOrderChoice;
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
  /** Guest-list callables — only meaningful on a 3+ game (T7.5–T7.6). A
   * two-seat game may export them; every one refuses a two-seat doc. */
  respondInvite: CallableFunction<unknown, unknown>;
  invitePlayers: CallableFunction<unknown, unknown>;
  leaveGame: CallableFunction<unknown, unknown>;
  startGame: CallableFunction<unknown, unknown>;
  setTurnOrder: CallableFunction<unknown, unknown>;
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
  const notifyRoom = createNotifyRoom(config.notify);

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

  /** How many seats this game will hold, from its own options. */
  const seatsFor = (options: TOptions): number =>
    config.maxPlayers ? config.maxPlayers(options) : PLAYERS.max;

  /**
   * A guest-list game is one that carries `maxPlayers` — written only at 3+,
   * so every two-seat doc is byte-for-byte what it always was and takes the
   * original code path everywhere below.
   */
  const isGuestList = (doc: Pick<GameDocData, 'maxPlayers'>): boolean =>
    typeof doc.maxPlayers === 'number' && doc.maxPlayers >= 3;

  function requireGuestList(doc: GameDocData): number {
    if (!isGuestList(doc)) {
      throw new HttpsError('failed-precondition', 'this game has no guest list');
    }
    if (doc.status !== 'open') {
      throw new HttpsError('failed-precondition', 'the game has already started');
    }
    return doc.maxPlayers!;
  }

  /** The guest-list fields, written together so the doc is never half-updated. */
  const guestListFields = (list: GuestList): Record<string, unknown> => ({
    roster: list.roster,
    invited: list.invited,
    declined: list.declined,
    playerIds: playerIdsOf(list),
    updatedAt: FieldValue.serverTimestamp(),
  });

  /** Display names for uids the caller has played with (the challengeUser
   *  rule: you may only reach people from your own games). One query. */
  async function lookupNames(
    db: FirebaseFirestore.Firestore,
    callerUid: string,
    uids: readonly string[],
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    if (uids.length === 0) return found;
    const myGames = await db
      .collection('games')
      .where('playerIds', 'array-contains', callerUid)
      .select('playerIds', 'players', 'playerNames', 'roster')
      .get();
    for (const snap of myGames.docs) {
      const d = snap.data() as Pick<GameDocData, 'playerIds' | 'players' | 'playerNames' | 'roster'>;
      for (const uid of uids) {
        if (found.has(uid) || !d.playerIds?.includes(uid)) continue;
        const seat = SEATS.find((key) => d.players?.[key] === uid);
        const fromRoster = d.roster?.find((e) => e.uid === uid)?.name;
        const name = (seat ? d.playerNames?.[seat] : null) ?? fromRoster ?? null;
        if (name) found.set(uid, name);
      }
    }
    return found;
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

  /**
   * Turn the guest list into seats: resolve the order, deal, flip to active.
   * Shared by joinGame's auto-start-at-max and (T7.6) the startGame callable.
   * Every write here happens after `config.initialGame`, which is pure.
   */
  function startGameInTx(
    db: FirebaseFirestore.Firestore,
    tx: Transaction,
    gameRef: DocumentReference,
    doc: GameDocData,
    list: GuestList,
  ): void {
    const options = config.parseOptions(doc.options);
    const order = resolveSeatOrder(doc.turnOrder ?? { mode: 'random' }, list.roster);
    if (order.length < PLAYERS.min) {
      throw new HttpsError('failed-precondition', `a game needs at least ${PLAYERS.min} players`);
    }
    const init = config.initialGame(options, order.length);
    const players: Record<string, string | null> = {};
    const playerNames: Record<string, string | null> = {};
    order.forEach((entry, i) => {
      players[seatKey(i)] = entry.uid;
      playerNames[seatKey(i)] = entry.name;
    });
    tx.update(gameRef, {
      players,
      playerNames,
      playerIds: order.map((entry) => entry.uid),
      roster: [...order],
      // Outstanding invitations lapse when the game starts — and with them the
      // read access `playerIds` was granting those uids.
      invited: [],
      // Freeze the resolved order so a rematch and the UI read the same list.
      turnOrder: { mode: 'arrange', order: order.map((entry) => entry.uid) },
      status: 'active',
      toMove: SEAT0,
      moveCount: 0,
      inviteCode: FieldValue.delete(),
      deadlineAt: deadlineFor(doc.timeControl ?? null),
      updatedAt: FieldValue.serverTimestamp(),
      ...init.fields,
    });
    writeInitialSubDocs(tx, gameRef, init);
    order.forEach((entry, i) => writeRack(tx, gameRef, init, i, entry.uid));
    if (doc.inviteCode) tx.delete(db.collection('invites').doc(doc.inviteCode));
  }

  const createGame = onCall(async (request) => {
    const caller = requireAuth(request);
    const options = config.parseOptions((request.data as { options?: unknown })?.options);
    const seats = seatsFor(options);
    const turnOrder = normalizeTurnOrder(
      config.parseSeatChoice((request.data as { seat?: unknown })?.seat),
    );

    const db = getFirestore();
    const gameRef = db.collection('games').doc();
    const code = makeCode();
    const inviteRef = db.collection('invites').doc(code);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(inviteRef);
      if (existing.exists) throw new HttpsError('aborted', 'invite collision, retry');
      const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);

      if (seats >= 3) {
        // Seats — and the deal — do not exist yet: the host may still invite,
        // people may still decline, and the count is only settled at start
        // (DECISIONS 2026-08-28). So no initialGame, no players map, no toMove.
        const list = emptyGuestList({ uid: caller.uid, name: caller.name });
        const timeControlDays = config.timeControlDays(options);
        tx.set(gameRef, {
          options,
          status: 'open',
          maxPlayers: seats,
          turnOrder,
          moveCount: 0,
          timeControl: timeControlDays ? { days: timeControlDays } : null,
          inviteCode: code,
          createdAt: FieldValue.serverTimestamp(),
          ...guestListFields(list),
        });
        tx.set(inviteRef, {
          gameId: gameRef.id,
          createdBy: caller.uid,
          hostName: caller.name,
          options,
          expiresAt,
          // Uid-free (invites/{code} is readable by anyone signed in).
          preview: previewOf(list, seats),
        });
        return;
      }

      const creatorSeat = creatorSeatFrom(turnOrder, seats);
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
        expiresAt,
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
    // The seat count comes from the OPTIONS, exactly as createGame reads it — a
    // challenge is addressed to one person, so a game whose range allows four
    // must still deal two here rather than PLAYERS.max empty seats.
    const seats = seatsFor(options);
    const creatorSeat = creatorSeatFrom(
      normalizeTurnOrder(config.parseSeatChoice((request.data as { seat?: unknown })?.seat)),
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
    const opponentName = (await lookupNames(db, caller.uid, [opponentUid])).get(opponentUid);
    if (opponentName === undefined) {
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
      // On a guest list only the host may call the whole thing off — everyone
      // else uses leaveGame, which takes only their own name off the list.
      if (isGuestList(data) && guestListOf(data).roster[0]?.uid !== caller.uid) {
        throw new HttpsError('permission-denied', 'only the host can cancel this game');
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
    type RoomEvent = { trigger: 'player-joined' | 'game-started'; audience: string[] };
    let roomEvent: RoomEvent | null = null;
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

      if (isGuestList(data)) {
        // First come, first served: an invitation reserves nothing, so a code
        // holder and an invitee take the next place on the same list.
        const seats = data.maxPlayers!;
        const list = joinRoster(guestListOf(data), { uid: caller.uid, name: caller.name }, seats);
        creatorUid = list.roster[0]?.uid ?? null;
        tx.update(gameRef, guestListFields(list));
        if (list.roster.length >= seats) {
          startGameInTx(db, tx, gameRef, data, list);
          roomEvent = { trigger: 'game-started', audience: list.roster.map((e) => e.uid) } as RoomEvent;
        } else {
          tx.update(inviteRef, { preview: previewOf(list, seats) });
          roomEvent = { trigger: 'player-joined', audience: list.roster.map((e) => e.uid) } as RoomEvent;
        }
        return inv.gameId;
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

    const event = roomEvent as RoomEvent | null;
    if (event) {
      // Everyone already in hears about it — except the person who just did it.
      await notifyRoom(
        db,
        event.audience.filter((uid) => uid !== caller.uid),
        event.trigger,
        { gameId, opponentName: caller.name, actorName: caller.name },
      );
    } else {
      await notify(db, creatorUid, 'game-joined', {
        gameId,
        opponentName: caller.name,
        actorName: caller.name,
      });
    }
    return { gameId };
  });

  const resign = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    let outcome: { finished: boolean; remaining: string[] } = { finished: false, remaining: [] };
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as GameDocData;
      const seatIndex = callerSeatIndex(doc, caller.uid);
      if (doc.status !== 'active') {
        throw new HttpsError('failed-precondition', 'game is not active');
      }
      if (((doc.withdrawn as string[] | undefined) ?? []).includes(seatKey(seatIndex))) {
        throw new HttpsError('failed-precondition', 'you have already left this game');
      }
      outcome = await withdrawInTx(config, tx, gameRef, doc, seatIndex, 'resign', caller.uid);
    });
    for (const uid of outcome.remaining) {
      await notify(db, uid, 'game-over', {
        gameId,
        opponentName: caller.name,
        actorName: caller.name,
        outcome: outcome.finished
          ? `You won — ${caller.name} resigned`
          : `${caller.name} left the game`,
      });
    }
    return { ok: true, finished: outcome.finished };
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

  /** Accept or decline an invitation to a 3+ game. A decline moves the name to
   *  `declined` and NEVER deletes the game (DECISIONS 2026-08-28); at two seats
   *  a decline is still respondChallenge's delete. */
  const respondInvite = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const accept = (request.data as { accept?: unknown })?.accept;
    if (typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'missing accept');

    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    let started = false;
    let audience: string[] = [];
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as GameDocData;
      const seats = requireGuestList(doc);
      const before = guestListOf(doc);
      if (!before.invited.some((e) => e.uid === caller.uid)) {
        throw new HttpsError('permission-denied', 'you have no invitation to this game');
      }
      const list = accept
        ? joinRoster(before, { uid: caller.uid, name: caller.name }, seats)
        : declineInvite(before, caller.uid);
      tx.update(gameRef, guestListFields(list));
      audience = list.roster.map((entry) => entry.uid).filter((uid) => uid !== caller.uid);
      if (accept && list.roster.length >= seats) {
        startGameInTx(db, tx, gameRef, doc, list);
        started = true;
      } else if (doc.inviteCode) {
        tx.update(db.collection('invites').doc(doc.inviteCode), {
          preview: previewOf(list, seats),
        });
      }
    });
    // A decline is nobody's business but the host's, and it is not push-worthy;
    // only an arrival or a start reaches the table.
    if (accept) {
      await notifyRoom(db, audience, started ? 'game-started' : 'player-joined', {
        gameId,
        opponentName: caller.name,
        actorName: caller.name,
      });
    }
    return { gameId, started };
  });

  /** Host adds names to the guest list. Recruiting is additive: the code stays
   *  live, and nothing here reserves a place. */
  const invitePlayers = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const raw = (request.data as { uids?: unknown })?.uids;
    if (!Array.isArray(raw) || raw.some((uid) => typeof uid !== 'string' || uid.length === 0)) {
      throw new HttpsError('invalid-argument', 'uids must be a non-empty string array');
    }
    const uids = [...new Set(raw as string[])].filter((uid) => uid !== caller.uid);
    if (uids.length === 0) throw new HttpsError('invalid-argument', 'nobody to invite');

    const db = getFirestore();
    // Same rule as challengeUser: you may only reach people you have played.
    const names = await lookupNames(db, caller.uid, uids);
    const unknown = uids.filter((uid) => !names.has(uid));
    if (unknown.length > 0) {
      throw new HttpsError('failed-precondition', 'you can only invite players from your games');
    }
    const entries: RosterEntry[] = uids.map((uid) => ({ uid, name: names.get(uid)! }));

    const gameRef = db.collection('games').doc(gameId);
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as GameDocData;
      requireGuestList(doc);
      const before = guestListOf(doc);
      if (before.roster[0]?.uid !== caller.uid) {
        throw new HttpsError('permission-denied', 'only the host can invite');
      }
      tx.update(gameRef, guestListFields(inviteToList(before, entries)));
    });
    await notifyRoom(db, uids, 'invited', {
      gameId,
      opponentName: caller.name,
      actorName: caller.name,
    });
    return { invited: uids };
  });

  /** Take your own name off a guest list before the game starts. The host
   *  leaving promotes the next arrival (roster[0] IS the host); the last one
   *  out deletes the game, exactly as cancelling would. */
  const leaveGame = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    let deleted = false;
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as GameDocData;
      const seats = requireGuestList(doc);
      const list = leaveList(guestListOf(doc), caller.uid);
      if (list.roster.length === 0) {
        if (doc.inviteCode) tx.delete(db.collection('invites').doc(doc.inviteCode));
        tx.delete(gameRef); // no moves exist while open — the doc is the game
        deleted = true;
        return;
      }
      tx.update(gameRef, guestListFields(list));
      if (doc.inviteCode) {
        tx.update(db.collection('invites').doc(doc.inviteCode), {
          hostName: list.roster[0]!.name,
          preview: previewOf(list, seats),
        });
      }
    });
    return { gameId, deleted };
  });

  /**
   * Start early (DECISIONS 2026-08-28 — the count is a MAXIMUM). Host-only.
   *
   * `expectedRoster` is the same guard `submitMove`'s `expectedMoveCount` is:
   * the host confirms a start against the list they were LOOKING at, so
   * somebody who joined in the last second is never silently left out — the
   * call fails and the host re-confirms against the new list.
   */
  const startGame = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const data = request.data as { expectedRoster?: unknown; turnOrder?: unknown };
    if (
      !Array.isArray(data?.expectedRoster) ||
      data.expectedRoster.some((uid) => typeof uid !== 'string')
    ) {
      throw new HttpsError('invalid-argument', 'expectedRoster must be an array of uids');
    }
    const expectedRoster = data.expectedRoster as string[];
    const turnOrder =
      data.turnOrder === undefined ? null : parseTurnOrderChoice(data.turnOrder);

    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    let audience: string[] = [];
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as GameDocData;
      requireGuestList(doc);
      const list = guestListOf(doc);
      if (list.roster[0]?.uid !== caller.uid) {
        throw new HttpsError('permission-denied', 'only the host can start the game');
      }
      const actual = list.roster.map((entry) => entry.uid);
      if (
        actual.length !== expectedRoster.length ||
        actual.some((uid, i) => uid !== expectedRoster[i])
      ) {
        throw new HttpsError(
          'failed-precondition',
          `the guest list changed (${actual.length} players now) — check who is in and start again`,
        );
      }
      startGameInTx(db, tx, gameRef, turnOrder ? { ...doc, turnOrder } : doc, list);
      audience = list.roster.map((entry) => entry.uid).filter((uid) => uid !== caller.uid);
    });
    await notifyRoom(db, audience, 'game-started', {
      gameId,
      opponentName: caller.name,
      actorName: caller.name,
    });
    return { gameId, started: true };
  });

  /**
   * Persist the host's turn-order choice BEFORE the start, so every player
   * sees the arrangement live rather than discovering it when the game begins
   * (DECISIONS 2026-08-28 — fairness by transparency, not by prohibition).
   */
  const setTurnOrder = onCall(async (request) => {
    const caller = requireAuth(request);
    const gameId = requireGameId(request.data);
    const turnOrder = parseTurnOrderChoice((request.data as { turnOrder?: unknown })?.turnOrder);

    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    await db.runTransaction(async (tx) => {
      const game = await tx.get(gameRef);
      if (!game.exists) throw new HttpsError('not-found', 'game not found');
      const doc = game.data() as GameDocData;
      requireGuestList(doc);
      const list = guestListOf(doc);
      if (list.roster[0]?.uid !== caller.uid) {
        throw new HttpsError('permission-denied', 'only the host can set the turn order');
      }
      if (turnOrder.mode === 'arrange') {
        const onRoster = new Set(list.roster.map((entry) => entry.uid));
        if (turnOrder.order.some((uid) => !onRoster.has(uid))) {
          throw new HttpsError('failed-precondition', 'the arrangement names somebody who is not in the game');
        }
      }
      tx.update(gameRef, { turnOrder, updatedAt: FieldValue.serverTimestamp() });
    });
    return { gameId, turnOrder };
  });

  return {
    createGame,
    joinGame,
    cancelGame,
    challengeUser,
    respondChallenge,
    rematch,
    resign,
    respondInvite,
    invitePlayers,
    leaveGame,
    startGame,
    setTurnOrder,
  };
}
