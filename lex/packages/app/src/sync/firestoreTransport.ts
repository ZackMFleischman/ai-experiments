// ported from hive/packages/app/src/sync/firestoreTransport.ts (adapted —
// heavily: lex is hidden-information, so the client cannot replay the
// opponent's log. DESIGN §3.3/§6.3.)
//
// FirestoreTransport: the GameTransport adapter behind the controller. Reads
// flow from Firestore snapshots; writes flow through the §6.3 callables
// (clients cannot write games/* — firestore.rules). Instead of a replayable
// entry stream, the transport feeds the session `sync` entries — coherent
// adoptions of {game doc public snapshot + own rack doc + move log} — and the
// session applies only the CLIENT'S OWN moves through the engine. Coherence:
// listeners are change SIGNALS; every emission re-fetches all three sources
// and checks them against each other (rack doc `n`, move-log length), so a
// half-landed transaction never reaches the controller.
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { RULESETS, type CellKey, type Seat, type TileFace, cellKey } from '@lex/engine';
import type { GameTransport, StoredGame } from '@parlor/core';
import type { GameOptions, LexEntry, SyncRow } from '../controller/entries';
import { getDb } from '@parlor/web/firebase';
import { fetchOrderedMoves, seatIndexOf, watchGameMeta } from '@parlor/web/transport';
import type { RosterEntry, TurnOrderChoice } from '@parlor/web/lobby-ui';
import * as api from './gameApi';
import type { LexGameOptions } from './gameApi';

/** Seat keys in move order (DESIGN §6.2). A doc only ever uses the first
 * `maxPlayers` of them; every two-seat doc uses exactly p0/p1. */
export const SEAT_KEYS = ['p0', 'p1', 'p2', 'p3'] as const;

interface GameDocData {
  /** Absent while a 3+ room is still a guest list: seats — and the deal — do
   * not exist until the host starts it (DESIGN §6.2). */
  players?: Record<string, string | null>;
  playerNames?: Record<string, string | null>;
  playerIds: string[];
  status: 'open' | 'active' | 'finished';
  options: LexGameOptions;
  /** Seat key to move. Absent on an open 3+ room, with the rest of the deal. */
  toMove?: string;
  moveCount: number;
  public?: string;
  scores?: Record<string, number>;
  rackCounts?: Record<string, number>;
  /** Winning seat key, or a shared top. Kept for pre-M7 games and the two-seat
   * `GameEnd`; `standings` is the N-seat truth. */
  result?: string;
  /** Every placing, best-first. A placing is a MAP because Firestore forbids
   * an array directly inside an array. */
  standings?: Array<{ seats: string[] }>;
  /** Seat keys that resigned or timed out of a running 3+ game. */
  withdrawn?: string[];
  endedBy?: 'played-out' | 'scoreless' | 'last-standing' | 'resign' | 'timeout';
  inviteCode?: string; // present while status 'open' (DESIGN §6.2)
  challenge?: { from: string; fromName: string; to: string; toName: string };
  // ── 3+ ONLY: the pre-start guest list. Its presence is what makes a game a
  // guest-list game; a two-seat doc carries none of these.
  maxPlayers?: number;
  roster?: RosterEntry[];
  invited?: RosterEntry[];
  declined?: RosterEntry[];
  turnOrder?: TurnOrderChoice;
  rematchGameId?: string;
  lastPlay?: { by: string; word: string; score: number };
  timeControl?: { days: number } | null;
  deadlineAt?: { toMillis(): number } | null;
}

/** The seat keys this doc actually dealt, in move order. Empty while a 3+ room
 * is open — nobody is seated yet. */
function seatsOf(players: Record<string, string | null>): string[] {
  return SEAT_KEYS.filter((key) => key in players);
}

/** Seat keys → seat indices, dropping any key this doc never dealt. */
function seatIndices(keys: readonly string[] | undefined, seats: readonly string[]): number[] {
  return (keys ?? []).map((key) => seats.indexOf(key)).filter((seat) => seat >= 0);
}

/** A guest-list game is one that carries `maxPlayers` — written only at 3+. */
function isGuestList(data: Pick<GameDocData, 'maxPlayers'>): boolean {
  return typeof data.maxPlayers === 'number' && data.maxPlayers >= 3;
}

/**
 * The two-seat `winner` the controller's `GameEnd` still reads. Prefers the
 * N-seat `standings` — a shared top placing IS a draw — and falls back to
 * `result` for a game finished before standings existed.
 */
function winnerOf(
  standings: readonly (readonly number[])[] | undefined,
  result: string,
  seats: readonly string[],
): Seat | 'draw' {
  const top = standings?.[0];
  if (top) return top.length > 1 ? 'draw' : ((top[0] ?? 0) as Seat);
  if (result === 'draw') return 'draw';
  return Math.max(0, seats.indexOf(result)) as Seat;
}

interface MoveDocData {
  n: number;
  kind: 'play' | 'exchange' | 'pass' | 'resign' | 'timeout';
  play?: {
    placements: Array<{ row: number; col: number; letter: string; isBlank: boolean }>;
    words: Array<{ word: string; score: number }>;
    score: number;
    bingo: boolean;
  };
  exchanged?: number;
  by: string;
}

export interface GameInfo {
  options: LexGameOptions;
  /** `null` on an open 3+ room: the caller belongs here — they are on its
   * guest list — but there are no seats to hold yet (DESIGN §6.2). */
  mySeat: Seat | null;
  status: GameDocData['status'];
  playerNames: Record<string, string | null>;
  inviteCode?: string;
  /** Marks that seatless room, so the caller knows the null seat means "not
   * started" rather than "not yours". */
  room?: boolean;
}

/** Live slice of the game doc the chrome renders outside the session state:
 * open→active flip, opponent name arrival, invite code / pending challenge
 * while waiting, rematch link — and, at 3+, the whole pre-start guest list. */
export interface GameMeta {
  status: GameDocData['status'];
  playerNames: Record<string, string | null>;
  /** The board in play — the room reads its seat range off the ruleset. */
  rulesetId: string;
  timeControl: { days: 1 | 3 | 7 } | null;
  /** The side-to-move's move deadline (ms), when the game has a time control. */
  deadlineAtMs?: number;
  inviteCode?: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
  rematchGameId?: string;
  // ── N seats (M7). Absent on a two-seat doc, which reads as it always did.
  maxPlayers?: number;
  roster?: readonly RosterEntry[];
  invited?: readonly RosterEntry[];
  declined?: readonly RosterEntry[];
  turnOrder?: TurnOrderChoice;
  /** Places still to fill while open; 0 once the game has started. */
  openSeats?: number;
  /** Seats that withdrew (resigned or timed out at 3+), as indices. */
  withdrawn?: readonly number[];
  /** Final placings, best-first, as seat indices. */
  standings?: readonly (readonly number[])[];
}

/** The public tier of the game doc, as `serializePublic` wrote it. */
interface PublicSnapshot {
  rulesetId: string;
  board: Record<CellKey, string>;
  scores: number[];
  bagCount: number;
  rackCounts: number[];
  toMove: number;
  moveCount: number;
  scorelessRun: number;
  /** Seats that have left. Absent on a snapshot written before M7. */
  withdrawn?: number[];
}

/**
 * The synthesized FULL state the session reconstructs its engine from: the real
 * public tier plus the caller's real rack; every other rack and the bag are '?'
 * placeholders of the right length (§3.3 — a blank face scores 0, so nothing
 * engine-visible can misread them).
 *
 * `withdrawn` MUST travel. `deserializeState` reads it back as [] when absent,
 * so a client that dropped it would stop skipping the seat that left and
 * silently disagree with the server about whose turn it is.
 */
export function synthesizedState(pub: PublicSnapshot, mySeat: Seat, myRack: string): string {
  return JSON.stringify({
    rulesetId: pub.rulesetId,
    board: pub.board,
    racks: pub.rackCounts.map((count, seat) => (seat === mySeat ? myRack : '?'.repeat(count))),
    bag: '?'.repeat(pub.bagCount),
    scores: pub.scores,
    toMove: pub.toMove,
    moveCount: pub.moveCount,
    scorelessRun: pub.scorelessRun,
    withdrawn: pub.withdrawn ?? [],
  });
}

/** The synthesized-state placeholder order for LogSession's init — replaced
 * by the first sync entry before anything renders. */
export function canonicalBagOrder(rulesetId: string): TileFace[] {
  const ruleset = RULESETS[rulesetId];
  if (!ruleset) throw new Error(`unknown ruleset '${rulesetId}'`);
  const order: TileFace[] = [];
  for (const [face, count] of Object.entries(ruleset.tiles.counts)) {
    for (let i = 0; i < count; i++) order.push(face);
  }
  return order;
}

export class FirestoreTransport implements GameTransport<GameOptions, LexEntry> {
  private players: Record<string, string | null> = {};
  private serverMoveCount = 0;
  private serverWithdrawnCount = 0;
  private logLength = 0;
  /** Monotonic gate: never re-emit a sync the session has already adopted —
   * a fetch racing a commit must not clobber newer optimistic state. Moves and
   * withdrawals both advance the game, and only moves touch `moveCount`, so
   * both are tracked. */
  private lastEmittedMoveCount = -1;
  private lastEmittedWithdrawnCount = -1;
  private fetching = false;
  private refetchQueued = false;
  private emitEntry: ((entry: LexEntry, index: number) => void) | undefined;
  private unsubs: Array<() => void> = [];

  constructor(
    private readonly gameId: string,
    private readonly uid: string,
  ) {}

  /** Fetch the game doc once: seat, options, names (before the controller). */
  async open(): Promise<GameInfo> {
    const snap = await getDoc(doc(getDb(), 'games', this.gameId));
    if (!snap.exists()) throw new Error('game not found');
    const data = snap.data() as GameDocData;
    this.players = data.players ?? {};
    const mySeat = seatIndexOf(this.players, this.uid, SEAT_KEYS);
    // A 3+ room that has not started carries no `players` at all, so a null
    // seat there is not a rejection — the caller is on the guest list and the
    // room screen is what they came for. A genuine stranger is still rejected,
    // at every seat count.
    const room =
      mySeat === null &&
      data.status === 'open' &&
      isGuestList(data) &&
      [...(data.roster ?? []), ...(data.invited ?? [])].some((e) => e.uid === this.uid);
    if (mySeat === null && !room) throw new Error('you are not a player in this game');
    return {
      options: data.options,
      mySeat,
      status: data.status,
      playerNames: data.playerNames ?? {},
      ...(room ? { room: true } : {}),
      ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
    };
  }

  /** Subscribe to the game-doc slice the chrome needs live (GameMeta).
   * `null` = the doc was deleted out from under us (declined/withdrawn
   * challenge, cancelled invite). */
  watchMeta(cb: (meta: GameMeta | null) => void): () => void {
    return watchGameMeta(
      this.gameId,
      (raw): GameMeta => {
        const data = raw as GameDocData;
        const seats = seatsOf(data.players ?? {});
        const roster = data.roster ?? [];
        // Only a guest-list doc gets the room fields — a two-seat meta stays
        // byte-for-byte what the waiting screens have always read.
        const maxPlayers = isGuestList(data) ? data.maxPlayers : undefined;
        return {
          status: data.status,
          playerNames: data.playerNames ?? {},
          rulesetId: data.options.rulesetId,
          timeControl: (data.timeControl as { days: 1 | 3 | 7 } | null | undefined) ?? null,
          ...(data.deadlineAt ? { deadlineAtMs: data.deadlineAt.toMillis() } : {}),
          ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
          ...(data.challenge ? { challenge: data.challenge } : {}),
          ...(data.rematchGameId ? { rematchGameId: data.rematchGameId } : {}),
          ...(maxPlayers !== undefined
            ? {
                maxPlayers,
                roster,
                invited: data.invited ?? [],
                declined: data.declined ?? [],
                openSeats: data.status === 'open' ? Math.max(0, maxPlayers - roster.length) : 0,
              }
            : {}),
          ...(data.turnOrder ? { turnOrder: data.turnOrder } : {}),
          ...(data.withdrawn ? { withdrawn: seatIndices(data.withdrawn, seats) } : {}),
          ...(data.standings
            ? { standings: data.standings.map((placing) => seatIndices(placing.seats, seats)) }
            : {}),
        };
      },
      cb,
    );
  }

  /** One coherent read of all three tiers, or null when not yet consistent
   * (a following listener signal retries). */
  private async fetchSync(): Promise<{ entry: LexEntry; options: GameOptions } | null> {
    const db = getDb();
    const gameSnap = await getDoc(doc(db, 'games', this.gameId));
    if (!gameSnap.exists()) return null;
    const game = gameSnap.data() as GameDocData;
    this.players = game.players ?? {};
    const seats = seatsOf(this.players);
    const mySeat = seatIndexOf(this.players, this.uid, SEAT_KEYS);
    // Seatless: either an open 3+ room (no deal exists yet) or a stranger.
    // Either way there is no state to adopt.
    if (mySeat === null || game.public === undefined) return null;

    const [rackSnap, moveData] = await Promise.all([
      getDoc(doc(db, 'games', this.gameId, 'racks', this.uid)),
      fetchOrderedMoves(this.gameId),
    ]);
    const rack = rackSnap.data() as { tiles: string; n: number } | undefined;
    if (!rack) return null;
    const moves = moveData as MoveDocData[];

    // Coherence gates: the move log must have caught up with the game doc,
    // and the rack doc must be current for my latest rack-writing move.
    if (moves.length !== game.moveCount) return null;
    const pub = JSON.parse(game.public) as PublicSnapshot;
    const iAmOut = (pub.withdrawn ?? []).includes(mySeat);
    const lastMine = [...moves]
      .reverse()
      .find((m) => m.by === this.uid && (m.kind === 'play' || m.kind === 'exchange' || m.kind === 'pass'));
    const expectedRackN = lastMine ? lastMine.n + 1 : 0;
    // A withdrawal empties the rack doc and stamps it with the move count it
    // happened at, which is NOT tied to any move of mine — so for a seat that
    // has left, rack currency is not a thing to wait for. Gating on it anyway
    // wedged the leaver's own client: it would never adopt another sync, and
    // so never learn that the game it had left had ended.
    if (!iAmOut && rack.n !== expectedRackN) return null;
    const state = synthesizedState(pub, mySeat, rack.tiles);

    // Seat of the uid that made each move — over the seats this doc dealt, not
    // a p0/p1 pair.
    const seatByUid = new Map<string, number>();
    seats.forEach((key, seat) => {
      const uid = this.players[key];
      if (uid) seatByUid.set(uid, seat);
    });

    const rows: SyncRow[] = moves.map((m) => ({
      n: m.n,
      by: (seatByUid.get(m.by) ?? 0) as Seat,
      kind: m.kind,
      word: m.play?.words[0]?.word ?? null,
      words: m.play?.words ?? [],
      score: m.play?.score ?? 0,
      ...(m.exchanged !== undefined ? { count: m.exchanged } : {}),
      cells: (m.play?.placements ?? []).map((p) => cellKey({ row: p.row, col: p.col })),
    }));

    // `standings` is the N-seat truth — best-first, an inner array of 2+ seats
    // tied, the withdrawn last (the engine placed them there; nothing here
    // re-sorts). `winner` is the two-seat shape the controller's GameEnd also
    // speaks. Both travel to the session: T7.16 widened LexEntry['ended'].
    const standings = game.standings?.map((placing) => seatIndices(placing.seats, seats));
    const ended =
      game.status === 'finished' && game.endedBy && game.result
        ? {
            endedBy: game.endedBy,
            winner: winnerOf(standings, game.result, seats),
            ...(standings ? { standings } : {}),
            ...(game.withdrawn ? { withdrawn: seatIndices(game.withdrawn, seats) } : {}),
          }
        : undefined;

    this.serverMoveCount = game.moveCount;
    this.serverWithdrawnCount = game.withdrawn?.length ?? 0;
    return {
      entry: {
        kind: 'sync',
        state,
        myRack: rack.tiles,
        rows,
        ...(ended ? { ended } : {}),
      },
      options: {
        rulesetId: game.options.rulesetId,
        dictionaryId: game.options.dictionaryId,
        bagOrder: canonicalBagOrder(game.options.rulesetId),
        // The real seat count, from the deal itself — 2, 3 or 4.
        seats: pub.rackCounts.length,
      },
    };
  }

  async load(): Promise<StoredGame<GameOptions, LexEntry> | null> {
    // While open (waiting for the opponent) the rack coherence gate can't
    // pass for the joiner-to-be; retry a few times for transient lag only.
    for (let attempt = 0; attempt < 5; attempt++) {
      const sync = await this.fetchSync();
      if (sync) {
        this.logLength = 1;
        // Seed BOTH gate counters: leaving the withdrawal one at its initial
        // -1 would make the next refetch's "advanced" test true on a game
        // nobody has left, and emit a stale read over the optimistic state.
        this.lastEmittedMoveCount = this.serverMoveCount;
        this.lastEmittedWithdrawnCount = this.serverWithdrawnCount;
        return { options: sync.options, log: [sync.entry] };
      }
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
    return null;
  }

  async submit(entry: LexEntry, _expectedIndex: number): Promise<void> {
    // The session appended this entry optimistically before calling us —
    // track it so the next sync emission lands at the session's real index.
    // (On rejection the session rolls back, our count runs ahead, the next
    // emission reads as a gap, and the session reloads wholesale.)
    this.logLength++;
    // The server's concurrency token is its own move count, not the session
    // log index (sync adoptions interleave with real entries).
    if (entry.kind === 'play') {
      await api.submitMove({
        gameId: this.gameId,
        expectedMoveCount: this.serverMoveCount,
        move: api.toWireMove({ type: 'play', placements: entry.placements }),
      });
    } else if (entry.kind === 'exchange') {
      // bagAfter is the local optimistic pin — the server re-shuffles for real.
      await api.submitMove({
        gameId: this.gameId,
        expectedMoveCount: this.serverMoveCount,
        move: api.toWireMove({ type: 'exchange', tiles: entry.tiles }),
      });
    } else if (entry.kind === 'pass') {
      await api.submitMove({
        gameId: this.gameId,
        expectedMoveCount: this.serverMoveCount,
        move: { type: 'pass' },
      });
    } else if (entry.kind === 'resign') {
      await api.resign({ gameId: this.gameId });
    } else if (entry.kind === 'timeout') {
      throw new Error('timeouts are declared by the forfeit sweep, not clients');
    } else {
      throw new Error('sync entries are transport-internal');
    }
  }

  onRemoteEntry(cb: (entry: LexEntry, index: number) => void): () => void {
    this.emitEntry = cb;
    const db = getDb();
    const signal = () => void this.refetch();
    this.unsubs = [
      onSnapshot(doc(db, 'games', this.gameId), signal, () => {}),
      onSnapshot(doc(db, 'games', this.gameId, 'racks', this.uid), signal, () => {}),
    ];
    return () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      this.emitEntry = undefined;
    };
  }

  /** Listener signal → coherent refetch → emit one sync adoption. Serialized;
   * a signal during a fetch queues exactly one follow-up. Index drift (the
   * session applied optimistic entries meanwhile) surfaces as a gap and the
   * session reloads wholesale — every path converges on fetchSync. */
  private async refetch(): Promise<void> {
    if (this.fetching) {
      this.refetchQueued = true;
      return;
    }
    this.fetching = true;
    try {
      const sync = await this.fetchSync();
      // Monotonic: a coherent-but-stale read (fetch raced a commit, or the
      // refill listener fired before the game doc) must not re-adopt an
      // older server state over newer local/optimistic state. Both counters
      // only ever rise server-side, so "either is greater" is still monotonic.
      //
      // The withdrawal count has to be in here: a withdrawal is not a move and
      // leaves `moveCount` alone, so keying the emission on moves alone
      // swallowed it — every other player's board went on showing the seat
      // that had left as still in the game, and only caught up when somebody
      // happened to move (or reloaded).
      const advanced =
        this.serverMoveCount > this.lastEmittedMoveCount ||
        this.serverWithdrawnCount > this.lastEmittedWithdrawnCount;
      if (sync && this.emitEntry && advanced) {
        this.lastEmittedMoveCount = this.serverMoveCount;
        this.lastEmittedWithdrawnCount = this.serverWithdrawnCount;
        this.emitEntry(sync.entry, this.logLength);
        this.logLength++;
      }
    } finally {
      this.fetching = false;
      if (this.refetchQueued) {
        this.refetchQueued = false;
        void this.refetch();
      }
    }
  }

  async reset(): Promise<void> {
    throw new Error('multiplayer games start through createGame, not reset');
  }
}
