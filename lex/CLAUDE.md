# CLAUDE.md — lex/

LEX: a 2–4-player crossword-tile-game PWA (Scrabble/Words-with-Friends family).
Independent pnpm workspace. LEX shares its
architecture with `../hive/` and ports much of hive's code (DESIGN.md §4); when a
task says **[port: hive path]**, start from that file.

## Read before doing anything

1. `REQUIREMENTS.md` — the numbered v1 feature inventory (FR/NFR) the plan builds.
2. `DESIGN.md` — what & why. §2.2 (Ruleset), §5.4 (Dictionary), §6.2 (schema),
   §6.3 (callables), and the engine API (IMPLEMENTATION.md §5) are **frozen
   surfaces**: changing them requires updating DESIGN.md in the same PR.
3. `IMPLEMENTATION.md` — the ordered task list. **§0 (build protocol) is
   mandatory**: one task per commit, tests first, run the task's gate, and for
   [visual] tasks capture screenshots with `pnpm validate:visual` and actually
   read them against `e2e/visual-checklist.md` before calling the task done.
   **§8 (lessons from hive) is mandatory reading** — don't re-debug solved problems.

## Hard rules

- The UI never computes rules — it renders engine verdicts (`checkPlay`,
  `scorePlay`, dictionary lookups) only.
- `@lex/engine`, `@lex/dict`, and `@parlor/core` stay zero-dependency, pure
  TS, deterministic (no Date.now/random; the bag order is an input).
- **Privacy is a security invariant:** rack letters and bag contents never appear
  in public docs, logs, pushes, or errors; exchanges carry a count only. The one
  exception: a phoney publishes the words its play formed (DESIGN §3.3) — not its
  placements, score, or rack. Rules tests cover the negatives.
- No game dimension hard-coded outside the `classic` ruleset data: board size,
  premiums, tile counts/points, rack size, bonuses all come from the `Ruleset`.
- The shared platform is the sibling repo-root workspace `../parlor/`
  (`@parlor/*`, source-linked per IMPLEMENTATION §1; its own CLAUDE.md governs
  it). It never imports game packages; firebase imports only under
  `@parlor/web`, `@parlor/server`, `app/src/sync/`, `packages/functions/`.
- Never weaken a test to pass a gate; never commit `artifacts/` or the compiled DAWG.
- Tasks marked ⚑ in IMPLEMENTATION.md need Zack (Firebase console, DNS, real
  devices) — do the code side, then list what's needed in the PR.

## Documentation (full policy: IMPLEMENTATION.md §7 — CI-enforced)

- The doc set is **closed** and line-budgeted; no new `.md` files, no budget bumps,
  without a DECISIONS.md entry. `scripts/check-docs.mjs` fails typecheck otherwise.
- Docs state the **current** system only: amend the owning section in place, in the
  same PR as the change. Decisions/judgment calls → append to `DECISIONS.md`
  (≤8 lines). When a milestone ships, collapse its IMPLEMENTATION.md task table to
  a SHIPPED entry there.

## Commands

Once M0 lands, all commands run from `lex/`: `pnpm dev`, `pnpm typecheck`,
`pnpm test`, `pnpm validate` (all gates), `pnpm validate:m0..m6`,
`pnpm validate:visual`, `pnpm validate:ux`. Until then, this list is the spec for
what M0 must wire up (IMPLEMENTATION.md §1).
