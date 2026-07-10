# IMPLEMENTATION — Sudoku

## §0 Build protocol

Same discipline as lex: tests first, implement to the gate, always-on
`pnpm typecheck && pnpm test`, never weaken a test to pass, docs amended in
the same PR. One milestone per PR where practical.

## §1 Wiring

Install `parlor/` before `sudoku/` (link: deps don't install the linked
package's own deps). Parlor consumed via `link:` + tsconfig `paths` + vite
`resolve.dedupe` + `optimizeDeps.exclude` — see `packages/app/vite.config.ts`.

## §2 Milestones

### M0 — engine + app + CI — SHIPPED (this PR)

Engine (grid/solve/generate/game + 22 tests incl. the uniqueness sweep),
app (session/board/screens + 8 jsdom flow tests), icons prebuild, PWA
build + bundle check, doc set, `sudoku-ci.yml` + `sudoku-deploy.yml`.
Gate: `pnpm typecheck && pnpm test && pnpm build && pnpm validate:m1`.

### M1 — ship the web app — agent side SHIPPED; ⚑ owner remainder

`/dev/gallery` (8 fixed-seed fixtures over `AppStateProvider`) + the
`sudoku-e2e` workspace: `pnpm validate:visual` walks it × 3 viewports × 2
themes with machine checks (console noise, 81 cells, digit glyphs, board fits
viewport); CI job uploads the captures. Lighthouse on the built PWA:
99/100/100/100 after a11y fixes (AppShell content = `<main>`, card
subtitles = `<p>` — the first two landed in `@parlor/brand`).
Remaining: ⚑ confirm `sudoku-zmf` Pages project + custom domain if wanted
(PR previews already deploy).

### M2 — polish from real play

Feedback-driven: highlight-completed-units beat, digit-first entry mode,
settings (error-highlight toggle), haptics-ready interaction hooks.

### M3 — the $1 native wrap (strategy Phase 3) — agent side SHIPPED; ⚑ store ops

Committed `native/{ios,android}` shells from the `capacitorConfig` factory;
icons/splash rendered from `@parlor/brand/icon-template` + `scripts/mark.mjs`
(`pnpm native:assets`); `store/listing.ts` validated in unit tests (privacy =
Data Not Collected); 4.2 defenses wired native-gated (entry/success haptics,
share from the solved dialog, review ask from the third win, status-bar sync);
`sudoku-android.yml` builds the unsigned release AAB. Runbook + ⚑ owner store
ops (accounts, signing, consoles, price): `GAME-SETUP.md` §12.

## §7 Docs policy

Closed set, line-budgeted, enforced by `scripts/check-docs.mjs` (wired into
`pnpm typecheck`): README 25, CLAUDE 55, REQUIREMENTS 250, DESIGN 500,
IMPLEMENTATION 400, DECISIONS uncapped (append-only). When a milestone
ships, collapse its task detail here to a one-liner; the record lives in
DECISIONS.md.
