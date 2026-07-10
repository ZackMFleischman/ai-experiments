# CLAUDE.md — sudoku/

Sudoku: a zero-backend solo PWA — the first `@parlor/solo` +
`@parlor/brand` consumer (strategy: repo-root `MINIMALIST-APPS-STRATEGY.md`).
Read `DESIGN.md` before structural changes; decisions go to `DECISIONS.md`.

## Hard rules

- **No firebase, ever** — not a dep, not an import, not a string in the
  bundle. `pnpm build` runs `scripts/check-bundle.mjs` to enforce it; CI
  fails on violation. Sudoku has no backend and never will.
- **No accounts, no analytics, no network calls.** All state lives in the
  player's localStorage via injected `KeyValueStorage`.
- `@sudoku/engine` stays zero-dependency, pure, deterministic — no
  `Math.random` (seeds come in via options; `createRng` is the only PRNG).
- Parlor packages are consumed as source-linked siblings (`link:` +
  tsconfig paths + vite dedupe). Install `parlor/` before `sudoku/`.
- Docs are a closed, line-budgeted set (`scripts/check-docs.mjs`, wired
  into typecheck): README/CLAUDE/REQUIREMENTS/DESIGN/IMPLEMENTATION +
  append-only DECISIONS. Never weaken a test to pass a gate.

## Commands

From `sudoku/`: `pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm test`,
`pnpm build` (static PWA + bundle check), `pnpm validate:m1` (40-puzzle
generation sweep). CI: `.github/workflows/sudoku-{ci,deploy}.yml`.
