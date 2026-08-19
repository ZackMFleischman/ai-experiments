# CLAUDE.md — breakout/

Bricks: a zero-backend arcade PWA — the first `@parlor/arcade` +
`@parlor/brand` consumer (strategy: repo-root `MINIMALIST-APPS-STRATEGY.md`).
Read `DESIGN.md` before structural changes; decisions go to `DECISIONS.md`.
The store name is **Bricks** (Breakout is Atari's trademark).

## Hard rules

- UI follows repo-root `DESIGN-PRINCIPLES.md` — the `@parlor/brand`
  shell/HUD/theme components ARE the rules; deviations need a
  `DECISIONS.md` entry.
- **No firebase, ever** — not a dep, not an import, not a string in the
  bundle. `pnpm build` runs `scripts/check-bundle.mjs` to enforce it; CI
  fails on violation. Bricks has no backend and never will.
- **No accounts, no analytics, no network calls.** All state lives in the
  player's localStorage via injected `KeyValueStorage`.
- `@breakout/engine` stays zero-dependency, pure, deterministic — no
  `Math.random`, no clock; the mulberry32 cursor lives in the state. **Same
  seed + same input trace → identical end state** is the archetype's gate
  (`pnpm validate:m1`); never weaken it.
- Game state advances only in the fixed tick (`@parlor/arcade` loop);
  rendering never mutates state. A physics/layout change that moves the
  golden trace is a rules change — update the golden in the same PR.
- Parlor packages are consumed as source-linked siblings (`link:` +
  tsconfig paths + vite dedupe). Install `parlor/` before `breakout/`.
- Docs are a closed, line-budgeted set (`scripts/check-docs.mjs`, wired
  into typecheck): README/CLAUDE/REQUIREMENTS/DESIGN/IMPLEMENTATION +
  append-only DECISIONS (a dead decision gets `⊘ superseded YYYY-MM-DD —
  <pointer>` appended — the only in-place edit, lint-checked). Never
  weaken a test to pass a gate.

## Commands

From `breakout/`: `pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm test`,
`pnpm build` (static PWA + bundle check), `pnpm validate:m1` (200-run
determinism sweep), `pnpm validate:visual` (gallery × viewports × themes —
read the captures in `artifacts/screens/`, don't just pass the gate).
Native wrap: `pnpm native:sync` / `pnpm native:assets` (committed
`native/{ios,android}` shells; runbook `GAME-SETUP.md` §12 — app code never
imports `@capacitor/*`, only `@parlor/native`).
CI: `.github/workflows/breakout-{ci,deploy,android}.yml`.
