// The single-player sibling of @parlor/core's LogSession: the same
// "moves are the source of truth, state is a fold" discipline, but with no
// transport — there is no opponent and no server, so the session owns the
// whole log. Keeping the full log (not just the live prefix) is what makes
// undo/redo a cursor move instead of a state mutation, and makes resume and
// replay free. Storage is injected so this package stays DOM-free.

export interface SoloSessionConfig<Options, Entry, State> {
  /** Fresh state for a game's options. Must be pure. */
  init(options: Options): State;
  /** Fold one accepted entry. Must be pure; may throw on corrupt entries. */
  apply(state: State, entry: Entry): State;
}

/** Structural twin of @parlor/core's KeyValueStorage — parlor packages stay
 * standalone; structural typing keeps the two interchangeable. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredSoloGame<Options, Entry> {
  options: Options;
  log: Entry[];
  /** Entries [0, cursor) are live; [cursor, length) is the redo tail. */
  cursor: number;
}

export class SoloSession<Options, Entry, State> {
  private options_: Options | null = null;
  private log_: Entry[] = [];
  private cursor_ = 0;
  private state_: State | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly config: SoloSessionConfig<Options, Entry, State>,
    private readonly storageKey: string,
    private readonly storage: KeyValueStorage,
  ) {
    this.restore();
  }

  get options(): Options | null {
    return this.options_;
  }

  get state(): State | null {
    return this.state_;
  }

  /** The live entries (undone redo tail excluded). */
  get log(): readonly Entry[] {
    return this.log_.slice(0, this.cursor_);
  }

  get canUndo(): boolean {
    return this.cursor_ > 0;
  }

  get canRedo(): boolean {
    return this.state_ !== null && this.cursor_ < this.log_.length;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** Start a fresh game, discarding any stored one. */
  start(options: Options): void {
    this.options_ = options;
    this.log_ = [];
    this.cursor_ = 0;
    this.state_ = this.config.init(options);
    this.persist();
    this.emit();
  }

  /** Append an entry at the cursor. Anything previously undone is
   * unreachable history now — a new line has been played. */
  submit(entry: Entry): void {
    if (this.state_ === null) return;
    this.state_ = this.config.apply(this.state_, entry);
    this.log_ = [...this.log_.slice(0, this.cursor_), entry];
    this.cursor_ = this.log_.length;
    this.persist();
    this.emit();
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.cursor_ -= 1;
    this.state_ = this.refold();
    this.persist();
    this.emit();
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    const entry = this.log_[this.cursor_] as Entry;
    this.state_ = this.config.apply(this.state_ as State, entry);
    this.cursor_ += 1;
    this.persist();
    this.emit();
    return true;
  }

  /** Forget the stored game entirely (e.g. after completion). */
  clear(): void {
    this.options_ = null;
    this.log_ = [];
    this.cursor_ = 0;
    this.state_ = null;
    try {
      this.storage.removeItem(this.storageKey);
    } catch {
      // Storage failures never interrupt play.
    }
    this.emit();
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  private refold(): State {
    let state = this.config.init(this.options_ as Options);
    for (let i = 0; i < this.cursor_; i++) {
      state = this.config.apply(state, this.log_[i] as Entry);
    }
    return state;
  }

  private persist(): void {
    try {
      const stored: StoredSoloGame<Options, Entry> = {
        options: this.options_ as Options,
        log: this.log_,
        cursor: this.cursor_,
      };
      this.storage.setItem(this.storageKey, JSON.stringify(stored));
    } catch {
      // Quota/permissions: play continues, it just won't survive a refresh.
    }
  }

  private restore(): void {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredSoloGame<Options, Entry>;
      if (
        !parsed ||
        typeof parsed.options !== 'object' ||
        parsed.options === null ||
        !Array.isArray(parsed.log) ||
        typeof parsed.cursor !== 'number' ||
        parsed.cursor < 0 ||
        parsed.cursor > parsed.log.length
      ) {
        return;
      }
      // A corrupt entry makes apply() throw — treat the whole stored game as
      // unrecoverable rather than resuming into a half-folded state.
      this.options_ = parsed.options;
      this.log_ = parsed.log;
      this.cursor_ = parsed.cursor;
      this.state_ = this.refold();
    } catch {
      this.options_ = null;
      this.log_ = [];
      this.cursor_ = 0;
      this.state_ = null;
    }
  }
}
