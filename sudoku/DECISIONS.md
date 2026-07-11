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

## 2026-07-10 — M3 agent side SHIPPED: the $1 native wrap (strategy Phase 3a+3b)

- Gates run: parlor typecheck+test (117, incl. 17 new `@parlor/native`
  mocked-bridge tests), sudoku typecheck+test (37: +4 native wiring, +3 store
  listing), `pnpm build` + bundle check, `validate:m1`. Android AAB builds in
  the new `sudoku-android.yml` (no local SDK — CI is the proof).
- **Bridge, not imports**: `@parlor/native` reaches Capacitor via the injected
  `globalThis.Capacitor` only; `@capacitor/*` are optional peers. The free PWA
  bundle is byte-identical with the wrap in the tree; app tests mock the
  bridge global. Boundary rule (d) machine-enforces it.
- Shells committed at `native/{ios,android}` via the factory's `ios.path` /
  `android.path` (config stays in `packages/app` per the strategy). The CLI's
  CJS config loader can't follow the barrel's `.js` imports → the factory is
  exposed as the import-free `@parlor/native/capacitor-config` subpath.
- Icons/splash: family frames extracted to `@parlor/brand/icon-template`
  (plain .mjs — node scripts import it loader-free); sudoku keeps only its
  mark. Rendered shell assets are committed; `packages/app/assets/` sources
  are generated (gitignored). `@capacitor/assets>sharp` overridden to 0.33
  (0.32's postinstall can't run in script-blocked installs).
- 4.2 defenses all native-gated: entry haptic per digit, success haptic +
  review ask from the 3rd win (OS-throttled) on solve, share in the solved
  dialog, status bar synced to color mode. Web UI unchanged (gallery stable).
- `check-docs` skips `native/` (generated shells ship their own READMEs).
- ⚑ owner store ops remain (GAME-SETUP.md §12): Apple/Play accounts, signing,
  consoles, $1 tier, questionnaires, screenshots; appId `com.zmfapps.sudoku`
  and the `zmf-apps.pages.dev` support placeholder are final only at first
  upload — rename before then if wanted.

- **2026-07-11 — house design language adopted.** Repo-root
  `DESIGN-PRINCIPLES.md` now governs UI, encoded in `@parlor/brand`
  (GameHud play header coherent by player count, accent-derived
  palette + board tokens, MoreFromUs demoted to a footer). The play screen's chrome title is now the wordmark ("Sudoku"); puzzle kind + clock moved into the shared `GameHud`. Home's cross-promo renders as the quiet brand footer.

- **2026-07-11 — MoreFromUs consumes the generated family list (PORTFOLIO-HARDENING M5).**
  Deleted Home's hand-kept `FAMILY` array; Home now imports `FAMILY` from
  `@parlor/brand` (re-exported from the registry-generated
  `family.generated.ts`, M1) and filters out its own entry
  (`.filter((app) => app.name !== 'Sudoku')`). One catalog, one source of
  truth — no per-app array to drift. Visible set is unchanged: `MoreFromUs`
  already renders only entries with a `url`, so the url-less duo games (Lex,
  Checkers) stay hidden exactly as before. Same change landed in breakout +
  stillness; the `gen-family.mjs --check` transition parity check that policed
  the three local arrays was retired (arcade-site, a static page that can't
  import the module, remains the only hand-kept copy it guards).
