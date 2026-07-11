# CLAUDE.md — katmai-bears/

**Katmai Bearcam Dashboard** — a React + TypeScript PWA that shows every Katmai / Brooks
Falls live bear cam in one dashboard (fullscreen, swipe, bear counter, fish-catch clips,
Bearapalooza alerts). It is an **independent pnpm workspace**, unrelated to `hive/`, `lex/`, or `parlor/`.

## Read before doing anything

- [`README.md`](./README.md) — what it is, features, how to run, how to refresh stream ids.
- [`DESIGN.md`](./DESIGN.md) — the detection **seam** (`DetectionSource`/`DetectionFrame`),
  the frontend-now → backend-later migration, and the technical constraints (COOP/COEP,
  codecs, YouTube-pixel limits). **Read before touching `src/detection/`, `src/clips/`, or
  `src/sw.ts`.**
- [`DECISIONS.md`](./DECISIONS.md) — append-only rationale log.
- [`DETECTION-PLAN.md`](./DETECTION-PLAN.md) — milestoned path from simulated counts to real,
  per-stream bear recognition (backend detector). Read before starting detection-backend work.

## Hard rules

- **The contract is sacred.** `src/contract/` is framework-free (no React, no DOM imports)
  and is the wire format a future backend implements. Keep it pure so it can be lifted to a
  shared package unchanged. All threshold logic lives in its reducer — unit-test any change.
- **Never enable cross-origin isolation (COOP/COEP).** It breaks the YouTube embeds. The
  reel uses the single-threaded ffmpeg core precisely to avoid it. See DESIGN.
- **Detection stays behind `DetectionSource`.** Downstream code (components, notifications,
  clips) must depend on the interface and derived store, never on a specific source.
- **Don't commit generated assets.** `public/icons/` and `public/ffmpeg/` are built by
  `scripts/*` at (pre)build time and are gitignored. Never hand-edit or commit them.
- **Strict TS is the gate.** `import type` for type-only imports, no `enum` (use `as const`
  unions), build optional props with conditional spread (exactOptionalPropertyTypes), guard
  all index access (noUncheckedIndexedAccess).

## Commands

```
pnpm dev            # Vite dev server
pnpm build          # production build (icons + ffmpeg core + vite)
pnpm typecheck      # tsc --noEmit across workspace
pnpm test           # vitest unit tests
pnpm e2e            # Playwright smoke suite
pnpm validate:m0    # typecheck && test && e2e — run before merging
```

Merge only with `pnpm validate:m0` green.
