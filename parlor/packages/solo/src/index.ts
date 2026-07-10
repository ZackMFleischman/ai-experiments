// @parlor/solo — the single-player kit: SoloSession (append-only local log
// with an undo/redo cursor), deterministic seed/PRNG utilities, and local
// account-free stats. Zero runtime dependencies, pure, deterministic;
// storage is injected, never touched directly. Firebase must never appear
// here (scripts/check-boundaries.mjs) — solo games have no backend at all.

/** Wiring probe — consumed by consumers' cross-workspace import tests. */
export const PARLOR_SOLO = { workspace: 'parlor', package: 'solo' } as const;

export {
  SoloSession,
  type KeyValueStorage,
  type SoloSessionConfig,
  type StoredSoloGame,
} from './soloSession.js';

export { dayKey, hashSeed, mulberry32, randomInt, shuffle } from './seed.js';

export {
  StatsStore,
  computeStreaks,
  type ResultRecord,
  type StatsSummary,
  type Streaks,
} from './stats.js';
