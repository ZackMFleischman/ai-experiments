// @parlor/core — game-agnostic platform kernel: the GameTransport seam and
// LogSession (log replay + optimistic submit/rollback), ported from hive
// (lex/IMPLEMENTATION.md T3.4). Zero runtime dependencies, pure,
// deterministic; storage is injected, never touched directly.

/** Wiring probe — consumed by lex's cross-workspace import test. */
export const PARLOR_CORE = { workspace: 'parlor', package: 'core' } as const;

export {
  LocalStorageTransport,
  LocalTransport,
  type GameTransport,
  type KeyValueStorage,
  type StoredGame,
} from './transport.js';

export {
  LogSession,
  type LogSessionConfig,
  type LogSessionHooks,
  type RejectMode,
} from './logSession.js';
