// ported from hive/packages/app/src/controller/transport.ts +
// localStorageTransport.ts (adapted, genericized)
// GameTransport seam: the session core never knows what's behind it. Games
// bring their own Options/Entry types; storage is injected (KeyValueStorage)
// so this package stays DOM-free.

export interface StoredGame<Options, Entry> {
  options: Options;
  log: Entry[];
}

export interface GameTransport<Options, Entry> {
  /** Source of truth on (re)connect; null = no game in progress. */
  load(): Promise<StoredGame<Options, Entry> | null>;
  /** Append an entry. Resolves when accepted; rejects when refused (desync). */
  submit(entry: Entry, expectedIndex: number): Promise<void>;
  /** Entries arriving from elsewhere (the opponent, another device). */
  onRemoteEntry(cb: (entry: Entry, index: number) => void): () => void;
  /** Start a fresh game, discarding any stored one. */
  reset(options: Options): Promise<void>;
}

/** Hot-seat transport: both players share the device; every submit is accepted
 * and echoed nowhere (the session already applied it optimistically). */
export class LocalTransport<Options, Entry> implements GameTransport<Options, Entry> {
  protected game: StoredGame<Options, Entry>;

  constructor(defaultOptions: Options) {
    // Created eagerly and appended synchronously inside submit(): back-to-back
    // submissions must observe each other's writes in call order, or the
    // concurrency guard rejects moves that were perfectly sequential.
    this.game = this.restore() ?? { options: defaultOptions, log: [] };
  }

  async load(): Promise<StoredGame<Options, Entry> | null> {
    return this.game;
  }

  async submit(entry: Entry, expectedIndex: number): Promise<void> {
    if (this.game.log.length !== expectedIndex) {
      throw new Error(`concurrency: expected index ${expectedIndex}, log is at ${this.game.log.length}`);
    }
    this.game.log.push(entry);
    this.persist();
  }

  onRemoteEntry(): () => void {
    return () => {};
  }

  async reset(options: Options): Promise<void> {
    this.game = { options, log: [] };
    this.persist();
  }

  protected persist(): void {
    // In-memory only; LocalStorageTransport overrides.
  }

  protected restore(): StoredGame<Options, Entry> | null {
    return null;
  }
}

/** The subset of the Web Storage API the transport needs — injected by the
 * consumer (window.localStorage in a browser) to keep this package DOM-free. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Hot-seat persistence: the in-progress game (options + entry log) survives
 * refresh via injected storage, entirely behind the GameTransport seam. */
export class LocalStorageTransport<Options, Entry> extends LocalTransport<Options, Entry> {
  constructor(
    defaultOptions: Options,
    private readonly storageKey: string,
    private readonly storage: KeyValueStorage,
  ) {
    super(defaultOptions);
    // The base constructor ran restore() before `storage` was assigned (class
    // field init order) — restore again now that it is.
    const stored = this.restoreFrom(storage, storageKey);
    if (stored) this.game = stored;
  }

  protected override persist(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.game));
    } catch {
      // Quota/permissions: play continues, it just won't survive a refresh.
    }
  }

  protected override restore(): StoredGame<Options, Entry> | null {
    return null; // handled in the constructor once `storage` exists
  }

  private restoreFrom(storage: KeyValueStorage, key: string): StoredGame<Options, Entry> | null {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredGame<Options, Entry>;
      if (!parsed || !Array.isArray(parsed.log) || typeof parsed.options !== 'object' || parsed.options === null) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
