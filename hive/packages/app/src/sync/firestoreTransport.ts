// FirestoreTransport (T4.6): the GameTransport adapter behind the controller.
// Reads flow from Firestore snapshots; writes flow through the §5.3 callables
// (clients cannot write games/* — firestore.rules). The move-log ↔ snapshot
// regression check runs on load per DESIGN §5.2.
//
// The shared transport plumbing — seat resolution, the game-doc meta listener
// (incl. the permission-denied delete-detection), and the log-replay reads —
// comes from @parlor/web/transport (parlor hardening Phase 3). hive is a
// perfect-information game, so its sync strategy IS log replay: `load` reads the
// ordered log, `onRemoteEntry` emits each appended move; the doc→entry map and
// the engine replay are hive's.
import { doc, getDoc } from 'firebase/firestore';
import {
  applyMove,
  deserializeState,
  hash,
  initialState,
  parseUhp,
  type Color,
  type GameOptions,
} from '@hive/engine';
import type { GameTransport, LogEntry, StoredGame } from '../controller/transport';
import { getDb } from '@parlor/web/firebase';
import {
  fetchOrderedMoves,
  seatIndexOf,
  watchAddedMoves,
  watchGameMeta,
} from '@parlor/web/transport';
import * as api from './gameApi';

interface GameDocData {
  players: { white: string | null; black: string | null };
  playerNames: { white: string | null; black: string | null };
  status: 'open' | 'active' | 'finished';
  options: GameOptions;
  moveCount: number;
  state: string;
  inviteCode?: string; // present while status 'open' (DESIGN §5.2)
  challenge?: { from: string; fromName: string; to: string; toName: string };
  rematchGameId?: string;
}

interface MoveDocData {
  n: number;
  kind: 'move' | 'pass' | 'resign' | 'timeout' | 'draw-offer' | 'draw-accept' | 'draw-decline';
  uhp?: string;
  by: string;
}

export interface GameInfo {
  options: GameOptions;
  myColor: Color;
  status: GameDocData['status'];
  playerNames: { white: string | null; black: string | null };
  inviteCode?: string;
}

/** Live slice of the game doc the chrome renders outside the move log:
 * open→active flip, opponent name arrival, invite code / pending challenge
 * while waiting. */
export interface GameMeta {
  status: GameDocData['status'];
  playerNames: { white: string | null; black: string | null };
  inviteCode?: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
}

export class FirestoreTransport implements GameTransport {
  private players: GameDocData['players'] = { white: null, black: null };

  constructor(
    private readonly gameId: string,
    private readonly uid: string,
  ) {}

  /** Fetch the game doc once: seat, options, names (before building the controller). */
  async open(): Promise<GameInfo> {
    const snap = await getDoc(doc(getDb(), 'games', this.gameId));
    if (!snap.exists()) throw new Error('game not found');
    const data = snap.data() as GameDocData;
    this.players = data.players;
    const seat = seatIndexOf(data.players, this.uid, ['white', 'black']);
    if (seat === null) throw new Error('you are not a player in this game');
    return {
      options: data.options,
      myColor: seat === 0 ? 'w' : 'b',
      status: data.status,
      playerNames: data.playerNames,
      ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
    };
  }

  /** Subscribe to the game-doc slice the chrome needs live (GameMeta).
   * `null` = the doc was deleted out from under us (declined/withdrawn
   * challenge, cancelled invite) — see @parlor/web/transport watchGameMeta. */
  watchMeta(cb: (meta: GameMeta | null) => void): () => void {
    return watchGameMeta(
      this.gameId,
      (data): GameMeta => {
        const d = data as GameDocData;
        return {
          status: d.status,
          playerNames: d.playerNames,
          ...(d.inviteCode ? { inviteCode: d.inviteCode } : {}),
          ...(d.challenge ? { challenge: d.challenge } : {}),
        };
      },
      cb,
    );
  }

  private toEntry(move: MoveDocData): LogEntry {
    if (move.kind === 'move' || move.kind === 'pass') {
      return { kind: move.kind, uhp: move.uhp ?? '' };
    }
    const by: Color = move.by === this.players.white ? 'w' : 'b';
    return { kind: move.kind, by };
  }

  async load(): Promise<StoredGame | null> {
    const gameSnap = await getDoc(doc(getDb(), 'games', this.gameId));
    if (!gameSnap.exists()) return null;
    const game = gameSnap.data() as GameDocData;
    this.players = game.players;
    const moves = await fetchOrderedMoves(this.gameId);
    const log = moves.map((d) => this.toEntry(d as MoveDocData));

    // Regression check (DESIGN §5.2): the denormalized snapshot must equal the
    // replayed log. The log is the source of truth either way.
    try {
      let replayed = initialState(game.options);
      for (const entry of log) {
        if (entry.kind === 'move' || entry.kind === 'pass') {
          replayed = applyMove(replayed, parseUhp(entry.uhp, replayed));
        }
      }
      if (hash(deserializeState(game.state)) !== hash(replayed)) {
        console.error('[hive] snapshot/log divergence on load — trusting the log');
      }
    } catch (err) {
      console.error('[hive] snapshot regression check failed', err);
    }

    return { options: game.options, log };
  }

  async submit(entry: LogEntry, expectedIndex: number): Promise<void> {
    if (entry.kind === 'move' || entry.kind === 'pass') {
      await api.submitMove({
        gameId: this.gameId,
        expectedMoveCount: expectedIndex,
        uhpMove: entry.uhp,
      });
    } else if (entry.kind === 'resign') {
      await api.resign({ gameId: this.gameId });
    } else if (entry.kind === 'draw-offer') {
      await api.offerDraw({ gameId: this.gameId });
    } else {
      await api.respondDraw({ gameId: this.gameId, accept: entry.kind === 'draw-accept' });
    }
  }

  onRemoteEntry(cb: (entry: LogEntry, index: number) => void): () => void {
    return watchAddedMoves(this.gameId, (data) => {
      const move = data as MoveDocData;
      cb(this.toEntry(move), move.n);
    });
  }

  async reset(): Promise<void> {
    throw new Error('multiplayer games start through createGame, not reset');
  }
}
