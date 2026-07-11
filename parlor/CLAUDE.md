# CLAUDE.md — parlor/

PARLOR: the game-agnostic platform workspace for this repo's turn-based
two-player PWA games. Read `README.md` here first; the design rationale and
hive port map live in `lex/DESIGN.md` §4, and **all build tasks live in
`lex/IMPLEMENTATION.md`** — parlor has no task list of its own and only grows
in service of a consumer's task.

## Hard rules

- **Never import a game package** (`@lex/*`, `@hive/*`) or reference
  game-specific concepts (tiles, words, hexes) — types are generic or injected.
  `scripts/check-boundaries.mjs` (wired into typecheck) enforces this.
- `@parlor/core` stays zero-dependency, pure, deterministic TS.
- react / firebase / MUI / Capacitor are **peerDependencies** — never regular
  deps; the consuming app provides them. Firebase imports only in `web/` and
  `server/`; Capacitor imports only in `native/` — and `native/` runtime code
  reaches Capacitor via the injected bridge (`globalThis.Capacitor`), never an
  import, so every wrapper no-ops in a plain browser.
- Every file ported from hive keeps its `// ported from hive/<path> (adapted)`
  header; when fixing a bug here, grep hive for the twin and flag it in the PR.
- Breaking a `@parlor/*` public interface requires updating the consumers and
  `lex/DESIGN.md` §4 in the same PR.
- `brand/` components encode repo-root `DESIGN-PRINCIPLES.md` (game-first
  real estate, GameHud by player count, accent-derived palette, footer
  cross-promo) — read it before changing them.
- Never weaken tests to pass a gate. Docs: this file + README only, ≤55 lines
  each, current-state only; decisions go to the consumer's DECISIONS.md.

## Commands

From `parlor/`: `pnpm install`, `pnpm typecheck`, `pnpm test`. Consumers must
install parlor before themselves (`lex/IMPLEMENTATION.md` §1 has the wiring).
