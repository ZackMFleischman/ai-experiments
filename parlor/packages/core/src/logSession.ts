// ported from hive/packages/app/src/controller/GameController.ts (adapted —
// the generic log-sync third: reload/replay, remote echo/gap handling,
// optimistic submit with rollback-or-resync. The game-specific state machine
// stays in the consuming game's controller.)
import type { GameTransport } from './transport.js';

export interface LogSessionConfig<Options, Entry, State> {
  /** Fresh state for a game's options. Must be pure. */
  init(options: Options): State;
  /** Fold one accepted entry. Must be pure; may throw on corrupt entries. */
  apply(state: State, entry: Entry): State;
}

export interface LogSessionHooks {
  /** A submit was refused by the transport (desync); state was restored. */
  onRejected?: (error: unknown) => void;
}

export type RejectMode = 'rollback' | 'resync';

export class LogSession<Options, Entry, State> {
  private options_: Options | null = null;
  private state_: State | null = null;
  private log_: readonly Entry[] = [];
  private listeners = new Set<() => void>();
  private remoteUnsub: (() => void) | undefined;

  constructor(
    private readonly transport: GameTransport<Options, Entry>,
    private readonly config: LogSessionConfig<Options, Entry, State>,
    private readonly hooks: LogSessionHooks = {},
  ) {}

  /** Restore from the transport's stored log and start listening for remote
   * entries (refresh resume; live sync). */
  async init(): Promise<void> {
    await this.reload();
    this.remoteUnsub ??= this.transport.onRemoteEntry((entry, index) => {
      this.applyRemote(entry, index);
    });
  }

  dispose(): void {
    this.remoteUnsub?.();
    this.remoteUnsub = undefined;
  }

  get options(): Options | null {
    return this.options_;
  }

  get state(): State | null {
    return this.state_;
  }

  get log(): readonly Entry[] {
    return this.log_;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** Rebuild from the transport's source of truth. Safety net for silently
   * dead realtime streams: call on visibility regain / push-sync. */
  async resync(): Promise<void> {
    await this.reload();
  }

  /** Optimistic submit: apply locally now, reconcile on rejection —
   * 'rollback' restores the pre-submit state; 'resync' reloads from the
   * transport (for entries whose refusal means we were out of sync). */
  submit(entry: Entry, mode: RejectMode = 'rollback'): void {
    if (this.state_ === null) return;
    const previous = { state: this.state_, log: this.log_ };
    this.state_ = this.config.apply(this.state_, entry);
    this.log_ = [...this.log_, entry];
    this.emit();
    void this.transport.submit(entry, previous.log.length).catch((error: unknown) => {
      if (mode === 'rollback') {
        this.state_ = previous.state;
        this.log_ = previous.log;
        this.emit();
      } else {
        void this.reload();
      }
      this.hooks.onRejected?.(error);
    });
  }

  /** Start a fresh game, discarding any stored one. */
  async reset(options: Options): Promise<void> {
    await this.transport.reset(options);
    this.options_ = options;
    this.state_ = this.config.init(options);
    this.log_ = [];
    this.emit();
  }

  private async reload(): Promise<void> {
    const stored = await this.transport.load();
    if (!stored) {
      this.emit();
      return;
    }
    let state = this.config.init(stored.options);
    for (const entry of stored.log) state = this.config.apply(state, entry);
    this.options_ = stored.options;
    this.state_ = state;
    this.log_ = [...stored.log];
    this.emit();
  }

  /** An entry arrived from elsewhere (opponent, other device). Echoes of
   * already-applied local entries are ignored; a gap means we missed
   * something and resync wholesale. */
  private applyRemote(entry: Entry, index: number): void {
    if (this.state_ === null) return;
    if (index < this.log_.length) return;
    if (index > this.log_.length) {
      void this.reload();
      return;
    }
    this.state_ = this.config.apply(this.state_, entry);
    this.log_ = [...this.log_, entry];
    this.emit();
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}
