# CLAUDE.md — hive/

HIVE: a two-player PWA of the board game Hive. Independent pnpm workspace.

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
- The platform sync layer (auth, firebase singleton, lobby hook, callable
  factory, push) comes from `@parlor/web` (repo-root sibling workspace, source-
  linked; its own CLAUDE.md governs it). It never imports game packages; the
  game keeps only its doc→summary mapping, typed callables, and transport.
- Firebase imports only under `app/src/sync/` (which consume `@parlor/web`) and
  `packages/functions/`.
- Never weaken a test to pass a gate; never commit `artifacts/`.
- Tasks marked ⚑ in IMPLEMENTATION.md need Zack (Firebase console, DNS, real
  devices) — do the code side, then list what's needed in the PR.

## Documentation (full policy: IMPLEMENTATION.md §7 — CI-enforced)

- The doc set is **closed** and line-budgeted; no new `.md` files, no budget bumps,
  without a DECISIONS.md entry. `scripts/check-docs.mjs` fails typecheck otherwise.
- Docs state the **current** system only: amend the owning section in place, in the
  same PR as the change. Never append "Update:" blocks; never restate a fact that
  has a home elsewhere — link it. Change narration goes in the PR description.
- Decisions and judgment calls → append to `DECISIONS.md` (≤8 lines). When a
  milestone ships, collapse its IMPLEMENTATION.md task table to a SHIPPED entry
  there. A dead decision gets `⊘ superseded YYYY-MM-DD — <pointer>` appended to
  its entry — the only in-place DECISIONS.md edit (lint-checked).

## Commands

Once M0 lands, all commands run from `hive/`: `pnpm dev`, `pnpm typecheck`,
`pnpm test`, `pnpm validate` (all gates), `pnpm validate:m0..m6`,
`pnpm validate:visual`, `pnpm validate:ux`. Until then, this list is the spec for
what M0 must wire up (IMPLEMENTATION.md §1).
