# DESIGN — Sudoku

How the pieces fit. Requirements live in `REQUIREMENTS.md`; the brand
strategy this executes is repo-root `MINIMALIST-APPS-STRATEGY.md` (Phase 2:
first zero-backend solo title, first `@parlor/solo`/`@parlor/brand` consumer).

## 1. Shape

Two packages in a pnpm workspace, plus source-linked parlor siblings:

- `packages/engine` (`@sudoku/engine`) — pure, zero-dep, deterministic.
- `packages/app` (`@sudoku/app`) — React + MUI + Vite PWA.
- `@parlor/solo` (session/undo/seeds/stats) and `@parlor/brand`
  (theme/shell/cross-promo) via `link:` deps + tsconfig paths + vite
  `resolve.dedupe`/`optimizeDeps.exclude` — the same sibling-workspace
  wiring lex uses (GAME-SETUP.md).

## 2. Engine

- **Grid** — a plain 81-number array (0 = empty) so entries/state serialize
  untouched through the stored log. `grid.ts` owns geometry (PEERS, units),
  candidates, conflict detection.
- **Solver** (`solve.ts`) — backtracking over row/col/box bitmasks (candidate
  set = one AND + popcount) with MRV cell choice. `countSolutions` caps at 2:
  generation only ever asks "unique or not". `solveSinglesOnly` is the
  difficulty oracle: naked + hidden singles to a fixpoint, null if stuck.
- **Generation** (`generate.ts`) — grow a full solution via rng-ordered
  backtracking, then dig clues in rng order, keeping every intermediate
  puzzle uniquely solvable. Difficulty = clue budget (40/34/28/24) plus a
  singles-only requirement for easy/medium, retried across ≤ 8 digs; the
  bounded fallback ships the first unique dig (slightly harder than
  labeled, never invalid) so generation always terminates.
- **Play state** (`game.ts`) — the reducer folded by SoloSession:
  `initSudoku(options)` generates from `options.seed`; `applySudoku` is pure
  and total (invalid entries return state unchanged, so a stored log can
  never wedge). Notes are per-cell bitmasks; placing a digit does the
  peer-note bookkeeping. `solved` = grid equals solution.
- **Determinism** — `createRng` (mulberry32) is duplicated from
  `@parlor/solo` on purpose: the engine stays zero-import like `@lex/engine`.
  Seeds come from the app (`hashSeed('daily:<dayKey>')` or clock-derived).

## 3. App

- **Session** (`src/game/session.ts`) — one `SoloSession` over
  `localStorage` (`sudoku:game`), reducer injected from the engine. init is
  memoized because SoloSession refolds from init on every undo. Stats in
  `StatsStore` (`sudoku:stats`); clock persisted per game key
  (`sudoku:clock`, `src/game/clock.ts`).
- **Providers** (`App.tsx`) — an AppContext carries session/stats/storage so
  tests inject fake storage; `ColorModeContext` + `createBrandTheme(mode,
  indigo #3b5bdb)`; BrowserRouter with `/` (Home) and `/game` (Game).
- **Board** (`src/board/Board.tsx`) — 9×9 CSS grid, per-cell borders for
  crisp box lines, quiet highlights: selection, same-digit echo, row/col
  wash, conflict red. Notes render as a 3×3 mini-grid. `DigitPad` fades
  spent digits and restyles in notes mode.
- **Game screen** — board + pad + one action row (undo/redo/erase/notes);
  keyboard (digits, arrows, backspace, N); solve dialog records the result
  exactly once and offers Done (clears the session).
- **Never blank**: a top-level ErrorBoundary shows a reload card; the
  stored game survives (log + cursor in localStorage).

## 4. PWA & deploy

vite-plugin-pwa `generateSW`, autoUpdate, SPA `navigateFallback` — full
offline cold-start (NFR-3). Icons generated at prebuild by sharp from an
inline SVG (never committed). Cloudflare Pages project `sudoku-zmf` via
`.github/workflows/sudoku-deploy.yml` (per-PR previews, prod on main,
degrades to build+verify when secrets are absent). `scripts/check-bundle.mjs`
fails the build if "firebase" appears in dist — the zero-backend invariant
is machine-checked, not aspirational.

## 5. Testing

- Engine: solver vs known puzzles, uniqueness/determinism/clue-budget sweep
  (`SUDOKU_PROP_PUZZLES` widens it in CI), singles oracle, reducer
  invariants (givens immutable, notes bookkeeping, wrong-digit ≠ solved).
- App: jsdom component flows over fake storage — start/play/undo/notes/
  resume/color-mode; `/game` with no session.
- Parlor: `@parlor/solo` has its own property test (state ≡ fold of live
  log under arbitrary submit/undo/redo walks).
- Deferred to the store-pipeline phase: Playwright visual/e2e via
  `@parlor/harness` (tracked in `IMPLEMENTATION.md`).
