// FirestoreTransport (T4.6): the GameTransport adapter behind the controller.
// Reads flow from Firestore snapshots; writes flow through the §5.3 callables
// (clients cannot write games/* — firestore.rules). The move-log ↔ snapshot
// regression check runs on load per DESIGN §5.2.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
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
import { getDb } from './firebase';
import * as api from './gameApi';

interface GameDocData {
  players: { white: string | null; black: string | null };
  playerNames: { white: string | null; black: string | null };
  status: 'open' | 'active' | 'finished';
  options: GameOptions;
  moveCount: number;
  state: string;
  inviteCode?: string; // present while status 'open' (DESIGN §5.2)
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
 * open→active flip, opponent name arrival, invite code while waiting. */
export interface GameMeta {
  status: GameDocData['status'];
  playerNames: { white: string | null; black: string | null };
  inviteCode?: string;
}

export class FirestoreTransport implements GameTransport {
  private players: GameDocData['players'] = { white: null, black: null };
  private unsub: (() => void) | undefined;

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
    const myColor: Color | null =
      data.players.white === this.uid ? 'w' : data.players.black === this.uid ? 'b' : null;
    if (!myColor) throw new Error('you are not a player in this game');
    return {
      options: data.options,
      myColor,
      status: data.status,
      playerNames: data.playerNames,
      ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
    };
  }

  /** Subscribe to the game-doc slice the chrome needs live (GameMeta). */
  watchMeta(cb: (meta: GameMeta) => void): () => void {
    return onSnapshot(doc(getDb(), 'games', this.gameId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as GameDocData;
      cb({
        status: data.status,
        playerNames: data.playerNames,
        ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
      });
    });
  }

  private toEntry(move: MoveDocData): LogEntry {
    if (move.kind === 'move' || move.kind === 'pass') {
      return { kind: move.kind, uhp: move.uhp ?? '' };
    }
    const by: Color = move.by === this.players.white ? 'w' : 'b';
    return { kind: move.kind, by };
  }

  async load(): Promise<StoredGame | null> {
    const db = getDb();
    const gameSnap = await getDoc(doc(db, 'games', this.gameId));
    if (!gameSnap.exists()) return null;
    const game = gameSnap.data() as GameDocData;
    this.players = game.players;
    const moves = await getDocs(
      query(collection(db, 'games', this.gameId, 'moves'), orderBy('n')),
    );
    const log = moves.docs.map((d) => this.toEntry(d.data() as MoveDocData));

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
    const moves = query(collection(getDb(), 'games', this.gameId, 'moves'), orderBy('n'));
    this.unsub = onSnapshot(moves, (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue;
        const data = change.doc.data() as MoveDocData;
        cb(this.toEntry(data), data.n);
      }
    });
    return () => {
      this.unsub?.();
      this.unsub = undefined;
    };
  }

  async reset(): Promise<void> {
    throw new Error('multiplayer games start through createGame, not reset');
  }
}
