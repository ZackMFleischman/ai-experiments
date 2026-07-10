# DECISIONS — Sudoku (append-only)

## 2026-07-10 — M0 SHIPPED: engine, app, CI (first brand solo title)

- Gates run: parlor typecheck+test (incl. new solo/brand packages), sudoku
  typecheck+test (30 tests), `pnpm build` + bundle check, `validate:m1`
  40-puzzle uniqueness sweep. All green.
- Born from MINIMALIST-APPS-STRATEGY.md Phase 2; first consumer of
  `@parlor/solo` + `@parlor/brand` (built in the same PR).
- Deviations from the initial sketch: solver rewritten from per-cell Set
  candidates to row/col/box bitmasks after the first generation sweep ran
  minutes instead of ms (~1000× faster; API unchanged). `@types/node` added
  to the app (vite.config imports node:url; lex inherits it transitively).
- Difficulty model kept honest-but-simple: clue budgets + singles-only
  oracle for easy/medium with a bounded-retry dig; expert is budget-only.
  Technique-graded difficulty is a post-v1 candidate.
- Engine duplicates mulberry32 (12 lines) rather than import @parlor/solo —
  zero-import engines port anywhere; drift risk accepted knowingly.
- Playwright visual/e2e deferred to M1 (harness gallery port) — jsdom flow
  tests cover the interaction logic meanwhile.

## 2026-07-10 — M1 SHIPPED (agent side): gallery, visual sweep, Lighthouse

- Gates run: parlor typecheck+test (100), sudoku typecheck+test+build+bundle
  check, `validate:visual` (48 captures, 0 machine-check failures, captures
  reviewed), Lighthouse 99/100/100/100 on the built PWA. All green.
- Gallery fixtures use fixed seeds and an exported `AppStateProvider` (context
  without theme) so entries sit under the harness Gallery's own ThemeProvider.
- a11y fixes landed at the brand layer deliberately: AppShell's content area
  is the `<main>` landmark and MoreFromUs titles are `<p>` — every future
  brand app inherits both. Only sudoku consumes `@parlor/brand`; hive/lex
  unaffected (their suites untouched).
- `MoreFromUs` hiding URL-less family entries confirmed as designed (Lex
  appears once it has a public URL) — no change.
- ⚑ remaining to close M1: confirm `sudoku-zmf` Pages project + custom domain.
