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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { RULESETS, type CellKey, type Seat, type TileFace, cellKey } from '@lex/engine';
import type { GameTransport, StoredGame } from '@parlor/core';
import type { GameOptions, LexEntry, SyncRow } from '../controller/entries';
import { getDb } from '@parlor/web/firebase';
import * as api from './gameApi';
import type { LexGameOptions } from './gameApi';

interface GameDocData {
  players: { p0: string | null; p1: string | null };
  playerNames: { p0: string | null; p1: string | null };
  playerIds: string[];
  status: 'open' | 'active' | 'finished';
  options: LexGameOptions;
  toMove: 'p0' | 'p1';
  moveCount: number;
  public: string;
  result?: 'p0' | 'p1' | 'draw';
  endedBy?: 'played-out' | 'scoreless' | 'resign' | 'timeout';
  inviteCode?: string; // present while status 'open' (DESIGN §6.2)
  challenge?: { from: string; fromName: string; to: string; toName: string };
  rematchGameId?: string;
  lastPlay?: { by: string; word: string; score: number };
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
  mySeat: Seat;
  status: GameDocData['status'];
  playerNames: GameDocData['playerNames'];
  inviteCode?: string;
}

/** Live slice of the game doc the chrome renders outside the session state:
 * open→active flip, opponent name arrival, invite code / pending challenge
 * while waiting, rematch link. */
export interface GameMeta {
  status: GameDocData['status'];
  playerNames: GameDocData['playerNames'];
  inviteCode?: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
  rematchGameId?: string;
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

function seatOf(uid: string, players: GameDocData['players']): Seat | null {
  if (players.p0 === uid) return 0;
  if (players.p1 === uid) return 1;
  return null;
}

export class FirestoreTransport implements GameTransport<GameOptions, LexEntry> {
  private players: GameDocData['players'] = { p0: null, p1: null };
  private serverMoveCount = 0;
  private logLength = 0;
  /** Monotonic gate: never emit a sync at or below this server move count —
   * a fetch racing a commit must not clobber newer optimistic state. */
  private lastEmittedMoveCount = -1;
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
    this.players = data.players;
    const mySeat = seatOf(this.uid, data.players);
    if (mySeat === null) throw new Error('you are not a player in this game');
    return {
      options: data.options,
      mySeat,
      status: data.status,
      playerNames: data.playerNames,
      ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
    };
  }

  /** Subscribe to the game-doc slice the chrome needs live (GameMeta).
   * `null` = the doc was deleted out from under us (declined/withdrawn
   * challenge, cancelled invite). */
  watchMeta(cb: (meta: GameMeta | null) => void): () => void {
    let seen = false;
    return onSnapshot(
      doc(getDb(), 'games', this.gameId),
      (snap) => {
        if (!snap.exists()) {
          if (seen) cb(null);
          return;
        }
        seen = true;
        const data = snap.data() as GameDocData;
        cb({
          status: data.status,
          playerNames: data.playerNames,
          ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
          ...(data.challenge ? { challenge: data.challenge } : {}),
          ...(data.rematchGameId ? { rematchGameId: data.rematchGameId } : {}),
        });
      },
      (err) => {
        // The read rule needs resource.data (playerIds), which a deleted doc
        // no longer has — so deletion reaches a live listener as
        // permission-denied, not as an exists:false snapshot.
        if (seen && (err as { code?: string }).code === 'permission-denied') cb(null);
      },
    );
  }

  /** One coherent read of all three tiers, or null when not yet consistent
   * (a following listener signal retries). */
  private async fetchSync(): Promise<{ entry: LexEntry; options: GameOptions } | null> {
    const db = getDb();
    const gameSnap = await getDoc(doc(db, 'games', this.gameId));
    if (!gameSnap.exists()) return null;
    const game = gameSnap.data() as GameDocData;
    this.players = game.players;
    const mySeat = seatOf(this.uid, game.players);
    if (mySeat === null) return null;

    const [rackSnap, moveSnaps] = await Promise.all([
      getDoc(doc(db, 'games', this.gameId, 'racks', this.uid)),
      getDocs(query(collection(db, 'games', this.gameId, 'moves'), orderBy('n'))),
    ]);
    const rack = rackSnap.data() as { tiles: string; n: number } | undefined;
    if (!rack) return null;
    const moves = moveSnaps.docs.map((d) => d.data() as MoveDocData);

    // Coherence gates: the move log must have caught up with the game doc,
    // and the rack doc must be current for my latest rack-writing move.
    if (moves.length !== game.moveCount) return null;
    const lastMine = [...moves]
      .reverse()
      .find((m) => m.by === this.uid && (m.kind === 'play' || m.kind === 'exchange' || m.kind === 'pass'));
    const expectedRackN = lastMine ? lastMine.n + 1 : 0;
    if (rack.n !== expectedRackN) return null;

    const pub = JSON.parse(game.public) as {
      rulesetId: string;
      board: Record<CellKey, string>;
      scores: number[];
      bagCount: number;
      rackCounts: number[];
      toMove: number;
      moveCount: number;
      scorelessRun: number;
    };
    // Synthesized FULL state: real public tier + real own rack; opponent rack
    // and bag are '?' placeholders of the right lengths (§3.3 — nothing
    // engine-visible can misread a 0-point blank face).
    const state = JSON.stringify({
      rulesetId: pub.rulesetId,
      board: pub.board,
      racks: pub.rackCounts.map((count, seat) =>
        seat === mySeat ? rack.tiles : '?'.repeat(count),
      ),
      bag: '?'.repeat(pub.bagCount),
      scores: pub.scores,
      toMove: pub.toMove,
      moveCount: pub.moveCount,
      scorelessRun: pub.scorelessRun,
    });

    const rows: SyncRow[] = moves.map((m) => ({
      n: m.n,
      by: (m.by === game.players.p0 ? 0 : 1) as Seat,
      kind: m.kind,
      word: m.play?.words[0]?.word ?? null,
      words: m.play?.words ?? [],
      score: m.play?.score ?? 0,
      ...(m.exchanged !== undefined ? { count: m.exchanged } : {}),
      cells: (m.play?.placements ?? []).map((p) => cellKey({ row: p.row, col: p.col })),
    }));

    const ended =
      game.status === 'finished' && game.endedBy && game.result
        ? {
            endedBy: game.endedBy,
            winner: (game.result === 'draw' ? 'draw' : game.result === 'p0' ? 0 : 1) as
              | Seat
              | 'draw',
          }
        : undefined;

    this.serverMoveCount = game.moveCount;
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
        seats: 2,
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
        this.lastEmittedMoveCount = this.serverMoveCount;
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
      // older server state over newer local/optimistic state. One emission
      // per server move count is enough — fetchSync already gates coherence.
      if (sync && this.emitEntry && this.serverMoveCount > this.lastEmittedMoveCount) {
        this.lastEmittedMoveCount = this.serverMoveCount;
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
