// App-level tuning knobs (distinct from the detection thresholds, which live in
// the framework-free contract). Kept small and in one place.
export const CONFIG = {
  /** How often the simulator emits a frame per stream. */
  simulatorTickMs: 1500,
  /** Length of a saved fish-catch clip. */
  clipDurationMs: 6000,
  /** Canvas capture rate for clips. */
  clipFps: 24,
  /** Cap on stored clips (oldest evicted) to bound IndexedDB growth. */
  maxClips: 60,
} as const;

export { DEFAULT_THRESHOLDS } from './contract';
export type { Thresholds } from './contract';
