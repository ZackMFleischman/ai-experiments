// @parlor/core — game-agnostic platform kernel: the GameTransport seam,
// LogSession (optimistic submit/rollback), shared meta types. Zero runtime
// dependencies, pure, deterministic. Real surfaces arrive with their porting
// tasks (lex/IMPLEMENTATION.md T3.4, T4.1); this is the T0.1 placeholder.

/** Placeholder wiring probe — consumed by lex's cross-workspace import test. */
export const PARLOR_CORE = { workspace: 'parlor', package: 'core' } as const;

/** Placeholder for the generic transport seam ported from hive (T3.4). */
export interface GameTransportPlaceholder {
  readonly kind: 'placeholder';
}
