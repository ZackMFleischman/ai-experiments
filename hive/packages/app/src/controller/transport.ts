// GameTransport seam (DESIGN §3.2): the controller never knows what's behind it.
// M3 ships LocalTransport (hot-seat); M4 adds the Firestore adapter.
import type { Color, GameOptions } from '@hive/engine';

export type LogEntry =
  | { kind: 'move' | 'pass'; uhp: string }
  | { kind: 'resign' | 'draw-offer' | 'draw-accept' | 'draw-decline'; by: Color };

export interface StoredGame {
  options: GameOptions;
  log: LogEntry[];
}

export interface GameTransport {
  /** Source of truth on (re)connect; null = no game in progress. */
  load(): Promise<StoredGame | null>;
  /** Append an entry. Resolves when accepted; rejects when refused (desync). */
  submit(entry: LogEntry, expectedIndex: number): Promise<void>;
  /** Entries arriving from elsewhere (the opponent, another device). */
  onRemoteEntry(cb: (entry: LogEntry, index: number) => void): () => void;
  /** Start a fresh game, discarding any stored one. */
  reset(options: GameOptions): Promise<void>;
}

/** Hot-seat transport: both players share the device; every submit is accepted
 * and echoed nowhere (the controller already applied it optimistically). */
export class LocalTransport implements GameTransport {
  protected game: StoredGame | null = null;

  constructor(private readonly defaultOptions: GameOptions) {}

  async load(): Promise<StoredGame | null> {
    if (!this.game) this.game = { options: this.defaultOptions, log: [] };
    return this.game;
  }

  async submit(entry: LogEntry, expectedIndex: number): Promise<void> {
    const game = this.game ?? (await this.load());
    if (!game) throw new Error('no game');
    if (game.log.length !== expectedIndex) {
      throw new Error(`concurrency: expected index ${expectedIndex}, log is at ${game.log.length}`);
    }
    game.log.push(entry);
    this.persist();
  }

  onRemoteEntry(): () => void {
    return () => {};
  }

  async reset(options: GameOptions): Promise<void> {
    this.game = { options, log: [] };
    this.persist();
  }

  protected persist(): void {
    // Hot-seat persistence lands in T3.11.
  }
}
