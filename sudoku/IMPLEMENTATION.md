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

### M1 — ship the web app (⚑ owner steps, then agent)

- ⚑ Cloudflare secrets already repo-wide? If so previews go live on the
  first PR; confirm `sudoku-zmf` Pages project + custom domain if wanted.
- Lighthouse PWA/a11y pass; fix what it surfaces.
- Playwright visual/ux sweep via `@parlor/harness` gallery (port the lex
  pattern: `/dev/gallery` entries for board states, 3 viewports, 2 themes).

### M2 — polish from real play

Feedback-driven: highlight-completed-units beat, digit-first entry mode,
settings (error-highlight toggle), haptics-ready interaction hooks.

### M3 — the $1 native wrap (strategy Phase 3)

`@parlor/native` + Capacitor shells + store metadata — starts only after
the strategy's Phase 3 kickoff; not v1 web scope.

## §7 Docs policy

Closed set, line-budgeted, enforced by `scripts/check-docs.mjs` (wired into
`pnpm typecheck`): README 25, CLAUDE 55, REQUIREMENTS 250, DESIGN 500,
IMPLEMENTATION 400, DECISIONS uncapped (append-only). When a milestone
ships, collapse its task detail here to a one-liner; the record lives in
DECISIONS.md.
