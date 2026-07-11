# CLAUDE.md — checkers/

Checkers: a two-player PWA on the `@parlor/*` platform (free hot-seat + online multiplayer), stamped from tafl/ (strategy: repo-root
`MINIMALIST-APPS-STRATEGY.md`). Read `DESIGN.md` before structural
changes; decisions go to `DECISIONS.md`. Until `DONE.md` is all
checked, `tools/create-app/PLAYBOOK.md` is the build runbook.

## Hard rules

- UI follows repo-root `DESIGN-PRINCIPLES.md` — the `@parlor/brand`
  shell/HUD/theme components ARE the rules; deviations need a
  `DECISIONS.md` entry.
- The stamped gates are the exemplar's, and they are law here too: never
  weaken a test, a lint, or a budget to pass one.
- The UI never computes rules — it renders engine verdicts only.
- The engine stays zero-dependency, pure, deterministic.
- Firebase imports only under `app/src/sync/` + `packages/functions/`;
  the default build is the firebase-free hot-seat PWA (bundle check);
  rules/indexes track parlor's canonical copies (parity lint).
- Parlor packages are consumed as source-linked siblings (`link:` +
  tsconfig paths + vite dedupe). Install `parlor/` before `checkers/`.
- Docs are a closed, line-budgeted set (`scripts/check-docs.mjs`, wired
  into typecheck), including `DONE.md`.

## Commands

From `checkers/`: `pnpm install`, `pnpm dev`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, and the `validate:*` gates listed in
package.json (visual captures land in `artifacts/screens/` — read them,
don't just pass the gate).
CI: `.github/workflows/checkers-*.yml`.
