// FirestoreTransport: the GameTransport adapter behind the online session.
// Reads flow from Firestore snapshots; writes flow through the callables
// (clients cannot write games/* — firestore.rules). checkers is a perfect-
// information game, so its sync strategy IS log replay (hive's path): `load`
// reads the ordered move log, `onRemoteEntry` emits each appended move; the
// doc→entry map and the engine replay are checkers's. The shared plumbing —
// seat resolution, the game-doc meta listener (incl. the permission-denied
// delete-detection), and the log reads — comes from @parlor/web/transport.
import { doc, getDoc } from 'firebase/firestore';
import type { GameTransport, StoredGame } from '@parlor/core';
import { getDb } from '@parlor/web/firebase';
import {
  fetchOrderedMoves,
  seatIndexOf,
  watchAddedMoves,
  watchGameMeta,
} from '@parlor/web/transport';
import { applyCheckers, deserializeCheckers, initialCheckers, type Side } from '@checkers/engine';
import type { CheckersGameOptions } from '../gameOptions';
import type { CheckersEntry } from '../game/entries';
import * as api from './gameApi';

interface GameDocData {
  players: { attackers: string | null; defenders: string | null };
  playerNames: { attackers: string | null; defenders: string | null };
  status: 'open' | 'active' | 'finished';
  options: CheckersGameOptions;
  moveCount: number;
  state: string;
  inviteCode?: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
  rematchGameId?: string;
  deadlineAt?: { toMillis(): number } | null;
}

interface MoveDocData {
  n: number;
  kind: 'move' | 'resign' | 'timeout';
  from?: number;
  to?: number;
  by: string;
}

export interface GameInfo {
  options: CheckersGameOptions;
  mySide: Side;
  status: GameDocData['status'];
  playerNames: GameDocData['playerNames'];
  inviteCode?: string;
}

/** Live slice of the game doc the chrome renders outside the move log. */
export interface GameMeta {
  status: GameDocData['status'];
  playerNames: GameDocData['playerNames'];
  inviteCode?: string;
  challenge?: { from: string; fromName: string; to: string; toName: string };
  rematchGameId?: string;
  deadlineAtMs?: number;
}

export class FirestoreTransport implements GameTransport<CheckersGameOptions, CheckersEntry> {
  private players: GameDocData['players'] = { attackers: null, defenders: null };

  constructor(
    private readonly gameId: string,
    private readonly uid: string,
  ) {}

  /** Fetch the game doc once: seat, options, names (before building the session). */
  async open(): Promise<GameInfo> {
    const snap = await getDoc(doc(getDb(), 'games', this.gameId));
    if (!snap.exists()) throw new Error('game not found');
    const data = snap.data() as GameDocData;
    this.players = data.players;
    const seat = seatIndexOf(data.players, this.uid, ['attackers', 'defenders']);
    if (seat === null) throw new Error('you are not a player in this game');
    return {
      options: data.options,
      mySide: seat === 0 ? 'attackers' : 'defenders',
      status: data.status,
      playerNames: data.playerNames,
      ...(data.inviteCode ? { inviteCode: data.inviteCode } : {}),
    };
  }

  /** Subscribe to the game-doc slice the chrome needs live. `null` = the doc
   * was deleted out from under us (declined/withdrawn challenge). */
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
          ...(d.rematchGameId ? { rematchGameId: d.rematchGameId } : {}),
          ...(d.deadlineAt ? { deadlineAtMs: d.deadlineAt.toMillis() } : {}),
        };
      },
      cb,
    );
  }

  private toEntry(move: MoveDocData): CheckersEntry {
    if (move.kind === 'move') {
      return { kind: 'move', from: move.from ?? -1, to: move.to ?? -1 };
    }
    const by: Side = move.by === this.players.attackers ? 'attackers' : 'defenders';
    return { kind: move.kind, by };
  }

  async load(): Promise<StoredGame<CheckersGameOptions, CheckersEntry> | null> {
    const gameSnap = await getDoc(doc(getDb(), 'games', this.gameId));
    if (!gameSnap.exists()) return null;
    const game = gameSnap.data() as GameDocData;
    this.players = game.players;
    const moves = await fetchOrderedMoves(this.gameId);
    const log = moves.map((d) => this.toEntry(d as unknown as MoveDocData));

    // Regression check: the denormalized snapshot must equal the replayed
    // log. The log is the source of truth either way.
    try {
      let replayed = initialCheckers();
      for (const entry of log) {
        if (entry.kind === 'move') {
          replayed = applyCheckers(replayed, { from: entry.from, to: entry.to });
        }
      }
      const snapshot = deserializeCheckers(game.state);
      if (log.every((e) => e.kind === 'move') && snapshot.board !== replayed.board) {
        console.error('[checkers] snapshot/log divergence on load — trusting the log');
      }
    } catch (err) {
      console.error('[checkers] snapshot regression check failed', err);
    }

    return { options: game.options, log };
  }

  async submit(entry: CheckersEntry, expectedIndex: number): Promise<void> {
    if (entry.kind === 'move') {
      await api.submitMove({
        gameId: this.gameId,
        expectedMoveCount: expectedIndex,
        move: { from: entry.from, to: entry.to },
      });
    } else if (entry.kind === 'resign') {
      await api.resign({ gameId: this.gameId });
    } else {
      // Timeouts are the server sweep's to write, never the client's.
      throw new Error('timeout entries are server-authored');
    }
  }

  onRemoteEntry(cb: (entry: CheckersEntry, index: number) => void): () => void {
    return watchAddedMoves(this.gameId, (data) => {
      const move = data as unknown as MoveDocData;
      cb(this.toEntry(move), move.n);
    });
  }

  async reset(): Promise<void> {
    throw new Error('multiplayer games start through createGame, not reset');
  }
}
