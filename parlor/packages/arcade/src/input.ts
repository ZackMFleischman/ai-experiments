// Input abstraction: DOM events (or anything else) push actions into a
// queue; the game drains the queue exactly once per simulation tick.
// Recording what was drained at which tick gives a trace; replaying feeds
// the same actions at the same ticks — with a deterministic engine, the
// same end state. That record/replay seam is the arcade archetype's key
// test ("same seed + same input trace → identical end state"). Actions are
// an opaque generic — the kit never knows a game's controls.

export interface TraceEntry<Action> {
  tick: number;
  actions: Action[];
}

export class InputQueue<Action> {
  private pending: Action[] = [];

  push(action: Action): void {
    this.pending.push(action);
  }

  /** Everything queued since the last drain, in arrival order. */
  drain(): Action[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  get size(): number {
    return this.pending.length;
  }
}

export class TraceRecorder<Action> {
  private entries: TraceEntry<Action>[] = [];

  /** Record a tick's drained actions; empty ticks are omitted. */
  record(tick: number, actions: readonly Action[]): void {
    if (actions.length === 0) return;
    this.entries.push({ tick, actions: [...actions] });
  }

  /** JSON-serializable as-is. */
  trace(): readonly TraceEntry<Action>[] {
    return this.entries;
  }
}

/** One past the last recorded tick — run the sim to here to cover a trace. */
export function traceEnd<Action>(
  trace: readonly TraceEntry<Action>[],
): number {
  const last = trace[trace.length - 1];
  return last === undefined ? 0 : last.tick + 1;
}

/** Sequential reader: call next(tick) for every tick in ascending order. */
export class TraceReplayer<Action> {
  private cursor = 0;

  constructor(private readonly entries: readonly TraceEntry<Action>[]) {}

  next(tick: number): Action[] {
    const out: Action[] = [];
    while (this.cursor < this.entries.length) {
      const entry = this.entries[this.cursor] as TraceEntry<Action>;
      if (entry.tick > tick) break;
      if (entry.tick === tick) out.push(...entry.actions);
      this.cursor += 1;
    }
    return out;
  }

  get done(): boolean {
    return this.cursor >= this.entries.length;
  }
}

// --- DOM bindings -----------------------------------------------------------
// Structural event-target twins keep this package DOM-free (lib: ES2022);
// window/document/canvas satisfy them at the call site.

export interface KeyEventLike {
  key?: string;
  preventDefault?: () => void;
}

export interface InputEventTarget {
  addEventListener(type: string, listener: (event: KeyEventLike) => void): void;
  removeEventListener(
    type: string,
    listener: (event: KeyEventLike) => void,
  ): void;
}

export interface HeldKeys {
  isDown(key: string): boolean;
  dispose(): void;
}

/** Track which of the given keys are held. Tracked keydowns are
 * preventDefault-ed (arrows scroll the page otherwise); blur releases
 * everything so backgrounding never leaves a key stuck down. */
export function trackHeldKeys(
  target: InputEventTarget,
  keys: readonly string[],
): HeldKeys {
  const tracked = new Set(keys);
  const held = new Set<string>();
  const down = (event: KeyEventLike): void => {
    if (event.key === undefined || !tracked.has(event.key)) return;
    held.add(event.key);
    event.preventDefault?.();
  };
  const up = (event: KeyEventLike): void => {
    if (event.key !== undefined) held.delete(event.key);
  };
  const blur = (): void => held.clear();
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', blur);
  return {
    isDown: (key) => held.has(key),
    dispose(): void {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
      held.clear();
    },
  };
}

export interface PointerEventLike {
  clientX?: number;
  clientY?: number;
  preventDefault?: () => void;
}

export interface PointerSurface {
  addEventListener(
    type: string,
    listener: (event: PointerEventLike) => void,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: PointerEventLike) => void,
  ): void;
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/** Report pointerdown/pointermove positions normalized to [0,1]×[0,1] of
 * the surface (clamped — dragging off the edge pins to it). Touch and mouse
 * arrive through the same pointer events. */
export function trackPointer(
  surface: PointerSurface,
  onPoint: (x: number, y: number) => void,
): () => void {
  const report = (event: PointerEventLike): void => {
    if (event.clientX === undefined || event.clientY === undefined) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    event.preventDefault?.();
    onPoint(x, y);
  };
  surface.addEventListener('pointerdown', report);
  surface.addEventListener('pointermove', report);
  return () => {
    surface.removeEventListener('pointerdown', report);
    surface.removeEventListener('pointermove', report);
  };
}
