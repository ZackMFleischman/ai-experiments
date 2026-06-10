import type { FrameCtx } from "./frame";

/**
 * Continuous time-varying value: memoized pull, evaluated at most once per
 * frame. Stateful signals (lag, envelopes) rely on being pulled every frame —
 * instances guarantee that by registering uniform updaters.
 */
export class Signal<T> {
  private lastFrame = -1;
  private cached!: T;

  constructor(private readonly fn: (f: FrameCtx) => T) {}

  get(f: FrameCtx): T {
    if (f.frame !== this.lastFrame) {
      this.cached = this.fn(f);
      this.lastFrame = f.frame;
    }
    return this.cached;
  }

  map<U>(fn: (value: T) => U): Signal<U> {
    return new Signal((f) => fn(this.get(f)));
  }

  static of<T>(value: T): Signal<T> {
    return new Signal(() => value);
  }
}

/** Anywhere a number is accepted, a Signal<number> is too. */
export type SignalLike = number | Signal<number>;

export function asSignal(v: SignalLike): Signal<number> {
  return typeof v === "number" ? Signal.of(v) : v;
}
