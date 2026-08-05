# CLAUDE.md — tafl/

TAFL: a two-player hnefatafl (11×11) PWA on the `@parlor/*` platform —
the second manual pass of the repo-root `GAME-SETUP.md` checklist and the
first duo title on `@parlor/brand`. Read `DESIGN.md` before structural
changes; decisions go to `DECISIONS.md`.

## Hard rules

- UI follows repo-root `DESIGN-PRINCIPLES.md` — the `@parlor/brand`
  shell/HUD/theme components ARE the rules; deviations need a
  `DECISIONS.md` entry.
- The UI never computes rules — it renders `legalDestinations()` output and
  folds engine entries only.
- `@tafl/engine` stays zero-dependency, pure, deterministic (no
  `Date.now`/`Math.random`; the repetition ledger lives in the state).
- Seats ARE sides: `seatKeys = ['attackers', 'defenders']` and the engine's
  `toMove` uses the same strings — never introduce a second naming layer.
- Firebase imports only under `app/src/sync/` and `packages/functions/`
  (`scripts/check-boundaries.mjs`); the default build is the firebase-free
  hot-seat PWA (`scripts/check-bundle.mjs`); rules/indexes track parlor's
  canonical copies (`scripts/check-rules-parity.mjs`). All three are wired
  into `pnpm typecheck`.
- The platform is the sibling `../parlor/` workspace (source-linked;
  install parlor first). It never imports game packages.
- Docs are a closed, line-budgeted set (`scripts/check-docs.mjs`).
  DECISIONS is append-only (a dead decision gets `⊘ superseded YYYY-MM-DD —
  <pointer>` appended — the only in-place edit, lint-checked). Never
  weaken a test to pass a gate; never commit `artifacts/`.
- ⚑ tasks need Zack (Firebase console, store ops, real devices) — do the
  code side, then list what's needed in the PR.

## Commands

From `tafl/`: `pnpm install`, `pnpm dev` (app + emulators), `pnpm
typecheck`, `pnpm test` (engine + app + emulator-backed functions; needs
Java 21), `pnpm build` (static PWA + bundle check), `pnpm validate:m0`
(gates + hot-seat e2e), `pnpm validate:m1` (200-game engine property
sweep), `pnpm validate:visual` (gallery × viewports × themes — read the
captures in `artifacts/screens/`, don't just pass the gate).
CI: `.github/workflows/tafl-{ci,deploy}.yml`.
