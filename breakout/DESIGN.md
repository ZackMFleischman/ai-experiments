# DESIGN — Bricks

How the pieces fit. Requirements in `REQUIREMENTS.md`; strategy context in
the repo-root `MINIMALIST-APPS-STRATEGY.md` (archetype 3: solo realtime
arcade, zero backend).

## §1 Shape

Independent pnpm workspace, sibling of `parlor/` (source-linked via `link:`
+ tsconfig paths + vite dedupe — sudoku's wiring, verbatim):

- `packages/engine` — `@breakout/engine`, the pure rules kernel.
- `packages/app` — `@breakout/app`, React PWA over `@parlor/{arcade,brand,
  native,solo}`.
- `e2e` — the visual gallery walker (`@parlor/harness`).
- `store/` — the typed store listing; `native/` — committed Capacitor
  shells; `scripts/` — check-docs + check-bundle.

## §2 Engine

A fixed-tick fold: `advance(state, actions): state` at 120 ticks/s over a
120×160 unit world. No classes, no clock, no `Math.random` — the mulberry32
cursor is a field *in* the state, so replays are exact. Actions are
`{t:'move'}` (keyboard), `{t:'target'}` (pointer), `{t:'serve'}`.

- Collisions: axis-probe vs the brick grid (step ≪ brick size, so one hit
  per tick), position-derived bounce off the paddle, wall reflection.
- Levels: `generateLevel(level, rng)` — density and hp grow with level,
  speed capped; layouts deterministic per (seed, level, serve history).
- The determinism gate (`validate:m1`, 200 fast-check traces) plus a golden
  trace pin the fold. `test/determinism.test.ts` is the archetype's proof.

## §3 App

React owns chrome; the game lives outside React state:

- `screens/Play.tsx` — the court. Engine state in a ref; `@parlor/arcade`
  `createFixedLoop` advances it (update = drain `InputQueue` → `advance`);
  `render` draws the whole frame to one canvas (`game/draw.ts`, palette
  from the MUI theme). HUD/dialogs are ordinary React, updated only on
  meaningful change. Input: `trackPointer` (drag → target), `trackHeldKeys`
  (arrows → move), pointerdown/Space (serve). `pauseWhenHidden` + a pause
  button; resume is always an explicit tap.
- `screens/Home.tsx` — pitch, Play, best runs (HighScoreStore), MoreFromUs.
- `App.tsx` — brand theme (`ACCENT` ember `#d9480f`), color-mode persist,
  status-bar sync, storage-injected context (tests use fakes).
- Gallery fixtures (`dev/registry.tsx`) fold scripted traces from a pinned
  seed and render `<Play fixture={state}/>` — one frozen frame, no loop, so
  captures are byte-reproducible. A game-over fixture opens the dialog.

## §4 PWA & deploy

vite-plugin-pwa autoUpdate SW, SPA fallback, generated icons from the
family template + `scripts/mark.mjs` (bricks/ball/paddle on the paper
tile). Cloudflare Pages (`breakout-zmf`) via `breakout-deploy.yml`; the
build fails if "firebase" appears in dist (`check-bundle.mjs`). Native: the
sudoku $1 pipeline (GAME-SETUP.md §12) — `capacitorConfig` factory,
committed shells, unsigned AAB in `breakout-android.yml`, no macOS CI.

## §5 Testing

- Engine: behavior + levels + the determinism property/golden (15 tests).
- App: jsdom wiring tests with a stubbed 2D context (routes, HUD, scores,
  frozen fixtures) + mocked-bridge native tests (serve haptic, share,
  status bar, web-invisibility) (13 tests).
- Visual: `validate:visual` walks the 6-entry gallery × 3 viewports × 2
  themes with canvas-geometry machine checks; captures land in
  `artifacts/screens/` for the agent's review pass.
- The full recorded-trace replay harness (record in-app, replay in tests)
  is deliberately engine-level only for v1 — the kit's `TraceRecorder` is
  wired where it matters (the determinism gate); in-app trace capture is a
  post-v1 candidate (see DECISIONS).
