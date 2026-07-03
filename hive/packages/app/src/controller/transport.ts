// GameTransport seam (DESIGN §3.2): the controller never knows what's behind it.
// M3 ships LocalTransport (hot-seat); M4 adds the Firestore adapter.
import type { Color, GameOptions } from '@hive/engine';

export type LogEntry =
  | { kind: 'move' | 'pass'; uhp: string }
  | { kind: 'resign' | 'timeout' | 'draw-offer' | 'draw-accept' | 'draw-decline'; by: Color };

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
  protected game: StoredGame;

  constructor(defaultOptions: GameOptions) {
    // Created eagerly and appended synchronously inside submit(): back-to-back
    // submissions must observe each other's writes in call order, or the
    // concurrency guard rejects moves that were perfectly sequential.
    this.game = this.restore() ?? { options: defaultOptions, log: [] };
  }

  async load(): Promise<StoredGame | null> {
    return this.game;
  }

  async submit(entry: LogEntry, expectedIndex: number): Promise<void> {
    if (this.game.log.length !== expectedIndex) {
      throw new Error(`concurrency: expected index ${expectedIndex}, log is at ${this.game.log.length}`);
    }
    this.game.log.push(entry);
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

  protected restore(): StoredGame | null {
    return null; // localStorage restore lands in T3.11
  }
}
