# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

`ai-experiments` is an umbrella repo of **independent pnpm workspaces** — there is
no root workspace; each project installs and gates on its own. (LOOM and
platefit were forked to their own repos and no longer live here — platefit is
now at https://github.com/ZackMFleischman/platefit.) The portfolio:

- **`parlor/`** — the shared platform workspace every game consumes:
  `core`/`web`/`server`/`harness` for 2–4-player Firebase games,
  `solo`/`arcade`/`brand`/`native` for the zero-backend brand titles. Consumed
  by sibling workspaces as source-linked `link:` deps — **always
  `pnpm install` in `parlor/` before installing a game** (`link:` deps don't
  install the linked package's own deps).
- **Two-player games** (Firebase, server-authoritative, invite-a-friend):
  `hive/` (live), `lex/`, `checkers/`, `tafl/`.
- **Zero-backend solo apps** (minimalist-apps brand, free PWA + $1 native):
  `sudoku/`, `breakout/` (ships as "Bricks"), `stillness/`.
- **`katmai-bears/`** — a React PWA dashboard of the Katmai / Brooks Falls live
  bear cams. Unrelated to parlor.
- **`arcade-site/`** — the static brand site (Cloudflare Pages, no build).
- **`tools/create-app/`** — the app factory: stamps a new game workspace from a
  living exemplar (`node tools/create-app/index.mjs <name> --kind
  duo|solo|arcade|utility`); its `PLAYBOOK.md` is the runbook.

**Each project has its own `CLAUDE.md` — read it before working in that
directory; it overrides anything here.**

## Repo-root doc map (pull on demand, don't pre-read)

- `MINIMALIST-APPS-STRATEGY.md` — what the brand is and why (archetypes,
  Capacitor, $1 pricing). Strategy only — current status lives in
  `BRAND-IMPLEMENTATION.md`, never here.
- `BRAND-IMPLEMENTATION.md` — the phased build ledger: what's shipped, what
  remains (including the ⚑ owner-only store/ops steps).
- `PORTFOLIO-HARDENING.md` — the active portfolio-wide hardening plan
  (milestones, priority-ordered).
- `GAME-SETUP.md` — reference for every wiring point of a two-player parlor
  game; the factory stamps this, read it when working by hand or debugging.
- `PARLOR-PLATFORM-HARDENING.md` — the platform's earlier hardening plan
  (shipped 2026-07-08; historical).
- `DESIGN-PRINCIPLES.md` — the house visual/UX rules that `@parlor/brand`
  components encode.

## Cross-project conventions

- Every game keeps a closed, line-budgeted doc set (README / CLAUDE /
  REQUIREMENTS / DESIGN / IMPLEMENTATION / DECISIONS), enforced by its
  `scripts/check-docs.mjs`. Decisions go to that project's `DECISIONS.md`.
- Engines are pure: zero runtime deps, deterministic, no
  `Date.now`/`Math.random` — seeds are inputs.
- Never weaken a test, lint, or budget to pass a gate.
- CI/deploy workflows live at the repo root
  (`.github/workflows/<app>-*.yml`), path-filtered on `<app>/**` +
  `parlor/**`.
- One live agent branch per workspace: before starting work, check open PRs
  touching that workspace and coordinate rather than collide.
