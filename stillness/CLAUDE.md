# CLAUDE.md — stillness/

Stillness: a zero-backend meditation timer — the first brand **utility**
(strategy archetype 4: `@parlor/brand` + `@parlor/native`, no engine, no
session kit). Read `DESIGN.md` before structural changes; decisions go to
`DECISIONS.md`.

## Hard rules

- **No firebase, ever** — not a dep, not an import, not a string in the
  bundle. `pnpm build` runs `scripts/check-bundle.mjs` to enforce it; CI
  fails on violation. Stillness has no backend and never will.
- **No accounts, no analytics, no network calls.** Stats live in the
  player's localStorage via injected `KeyValueStorage`.
- The timer stays a **pure machine** (`src/timer/timer.ts`): remaining time
  is arithmetic over an injected `now`, never interval-owned state.
- **App code never imports `@capacitor/*`** — only `@parlor/native`, whose
  wrappers no-op in a plain browser (parlor boundary lint enforces the
  package side). The web build's behavior never depends on the wrap.
- Zero audio assets: the bell is synthesized (`src/timer/bell.ts`); the
  backgrounded bell is the scheduled local notification.
- Parlor packages are consumed as source-linked siblings (`link:` +
  tsconfig paths + vite dedupe). Install `parlor/` before `stillness/`.
- Docs are a closed, line-budgeted set (`scripts/check-docs.mjs`, wired
  into typecheck). Never weaken a test to pass a gate.

## Commands

From `stillness/`: `pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm test`,
`pnpm build` (static PWA + bundle check), `pnpm validate:visual` (gallery ×
viewports × themes — read the captures in `artifacts/screens/`).
Native wrap: `pnpm native:sync` / `pnpm native:assets` (committed
`native/{ios,android}` shells; runbook `GAME-SETUP.md` §12).
CI: `.github/workflows/stillness-{ci,deploy,android}.yml`.
