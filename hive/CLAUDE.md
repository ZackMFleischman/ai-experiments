# CLAUDE.md — hive/

HIVE: a two-player PWA of the board game Hive. Independent pnpm workspace —
**nothing here relates to `loom/`**; ignore the repo-root CLAUDE.md's loom guidance
when working in this directory.

## Read before doing anything

1. `DESIGN.md` — what & why. §5.2 (schema), §5.3 (callables), and the engine API are
   **frozen surfaces**: changing them requires updating DESIGN.md in the same PR.
2. `IMPLEMENTATION.md` — the ordered task list. **§0 (build protocol) is mandatory**:
   one task per commit, tests first, run the task's gate, and for [visual] tasks
   capture screenshots with `pnpm validate:visual` and actually read them against
   `e2e/visual-checklist.md` before calling the task done.

## Hard rules

- The UI never computes rules — it renders `legalMoves()` output only.
- `@hive/engine` stays zero-dependency, pure TS, deterministic (no Date.now/random).
- Firebase imports only under `app/src/sync/` and `packages/functions/`.
- Never weaken a test to pass a gate; never commit `artifacts/`.
- Tasks marked ⚑ in IMPLEMENTATION.md need Zack (Firebase console, DNS, real
  devices) — do the code side, then list what's needed in the PR.

## Commands

Once M0 lands, all commands run from `hive/`: `pnpm dev`, `pnpm typecheck`,
`pnpm test`, `pnpm validate` (all gates), `pnpm validate:m0..m6`,
`pnpm validate:visual`, `pnpm validate:ux`. Until then, this list is the spec for
what M0 must wire up (IMPLEMENTATION.md §1).
