// @parlor/arcade — the realtime single-player kit: a fixed-timestep game
// loop (deterministic update tick, rAF render), input abstraction with
// recordable traces, pause-on-background, canvas sizing math, and a local
// account-free high-score store. Zero runtime dependencies, DOM-free
// (structural twins; drivers/storage injected). Firebase must never appear
// here (scripts/check-boundaries.mjs) — arcade games have no backend at all.

/** Wiring probe — consumed by consumers' cross-workspace import tests. */
export const PARLOR_ARCADE = { workspace: 'parlor', package: 'arcade' } as const;

export {
  createFixedLoop,
  type FixedLoop,
  type FixedLoopConfig,
  type LoopDriver,
} from './loop.js';

export {
  InputQueue,
  TraceRecorder,
  TraceReplayer,
  traceEnd,
  trackHeldKeys,
  trackPointer,
  type HeldKeys,
  type InputEventTarget,
  type KeyEventLike,
  type PointerEventLike,
  type PointerSurface,
  type TraceEntry,
} from './input.js';

export {
  pauseWhenHidden,
  type Pausable,
  type VisibilityDoc,
} from './visibility.js';

export { fitCanvas, letterbox, type CanvasLike, type Viewport } from './canvas.js';

export {
  HighScoreStore,
  type KeyValueStorage,
  type ScoreRecord,
} from './highScores.js';
