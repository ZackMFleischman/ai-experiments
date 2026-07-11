// The realtime heart of the arcade kit: rendering happens whenever the
// browser paints, but game state only ever advances in fixed-size ticks —
// same tick count, same order, every run. That split is what keeps arcade
// games deterministic (and therefore replayable and testable without a
// backend): the engine folds per-tick inputs, the loop only decides *when*
// ticks happen. The driver (clock + frame scheduler) is injected so tests
// own time; the default reaches requestAnimationFrame off globalThis.

export interface LoopDriver {
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(handle: number): void;
}

export interface FixedLoopConfig {
  /** Simulation tick length in ms (e.g. 1000 / 120). */
  stepMs: number;
  /** Called once per elapsed tick with the tick number (0-based). */
  update(tick: number): void;
  /** Called once per frame with interpolation alpha in [0, 1). */
  render(alpha: number): void;
  /** Frames longer than this many ticks are clamped (background tabs,
   * debugger pauses) instead of spiraling; the lost time is dropped. */
  maxTicksPerFrame?: number;
  driver?: LoopDriver;
}

export interface FixedLoop {
  /** Begin a fresh run: tick resets to 0. */
  start(): void;
  stop(): void;
  /** Freeze the simulation; frames keep painting nothing. Never resumes on
   * its own — resuming is a deliberate player act (see visibility.ts). */
  pause(): void;
  resume(): void;
  readonly running: boolean;
  readonly paused: boolean;
  /** The next tick to be simulated. */
  readonly tick: number;
}

export function createFixedLoop(config: FixedLoopConfig): FixedLoop {
  const driver = config.driver ?? defaultDriver();
  const maxTicks = config.maxTicksPerFrame ?? 5;
  let running = false;
  let paused = false;
  let tick = 0;
  let last = 0;
  let accumulator = 0;
  let handle: number | null = null;

  const frame = (): void => {
    handle = driver.requestFrame(frame);
    const now = driver.now();
    const delta = now - last;
    last = now;
    if (paused) return;
    accumulator = Math.min(accumulator + delta, maxTicks * config.stepMs);
    while (accumulator >= config.stepMs) {
      config.update(tick);
      tick += 1;
      accumulator -= config.stepMs;
    }
    config.render(accumulator / config.stepMs);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      paused = false;
      tick = 0;
      accumulator = 0;
      last = driver.now();
      handle = driver.requestFrame(frame);
    },
    stop(): void {
      if (!running) return;
      running = false;
      if (handle !== null) driver.cancelFrame(handle);
      handle = null;
    },
    pause(): void {
      paused = true;
    },
    resume(): void {
      // Re-anchor the clock so the hidden interval never becomes a tick burst.
      last = driver.now();
      accumulator = 0;
      paused = false;
    },
    get running(): boolean {
      return running;
    },
    get paused(): boolean {
      return paused;
    },
    get tick(): number {
      return tick;
    },
  };
}

function defaultDriver(): LoopDriver {
  const g = globalThis as {
    requestAnimationFrame?: (cb: (time: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
    performance?: { now(): number };
  };
  const raf = g.requestAnimationFrame;
  const caf = g.cancelAnimationFrame;
  const perf = g.performance;
  if (!raf || !caf || !perf) {
    throw new Error(
      'no requestAnimationFrame/performance here — inject a LoopDriver',
    );
  }
  return {
    now: () => perf.now(),
    requestFrame: (cb) => raf(() => cb()),
    cancelFrame: (handle) => caf(handle),
  };
}
