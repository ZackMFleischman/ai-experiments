# IMPLEMENTATION — Bricks

Status ledger. Task detail lives in the milestone sections; design
rationale in `DESIGN.md`; the strategy plan in repo-root
`BRAND-IMPLEMENTATION.md` (Phase 4a — this app proves `@parlor/arcade`).

## §0 Build protocol

Tests first where behavior is specifiable; `pnpm typecheck && pnpm test`
always-on; docs amended in the same PR; one milestone per PR; never weaken
a gate. Engine changes that move the golden trace are rules changes and
say so in the PR.

## §1 Gates (every PR)

`pnpm typecheck` (docs lint + all packages) · `pnpm test` (engine + app) ·
`pnpm build` (PWA + no-firebase bundle check) · `pnpm validate:m1`
(200-run determinism sweep) · `pnpm validate:visual` (gallery captures —
review them, don't just pass).

## §2 Milestones

### M0 — engine + app + gallery + store pipeline — SHIPPED (this PR)

The whole title in one slice, proving `@parlor/arcade` end to end: pure
fixed-tick engine (15 tests incl. the archetype determinism gate), canvas
Play screen over the kit loop with pointer/keyboard/serve input and
pause-on-background, Home with local best runs, brand shell + ember accent,
6-entry frozen-fixture gallery + visual sweep, PWA + bundle check, native
shells + validated store listing + 4.2 defenses, `breakout-{ci,deploy,
android}.yml`. ⚑ owner remainder: store ops per `GAME-SETUP.md` §12 (both
consoles, signing, $1 price, screenshots from captures, on-device
checklist), Cloudflare project confirm on first deploy.

### M1 — polish from real play — open

Feedback-driven candidates: sound toggle (synthesized, zero assets), subtle
screen-shake, brick-break particles (canvas-only), difficulty tuning from
real runs, in-app trace capture for bug repros.

## §7 Docs policy

Closed, line-budgeted doc set enforced by `scripts/check-docs.mjs` (wired
into `pnpm typecheck`): README 25 · CLAUDE 55 · REQUIREMENTS 250 · DESIGN
500 · IMPLEMENTATION 400 · DECISIONS uncapped (append-only). Shipped
milestone detail collapses to a one-liner here; the record lives in
`DECISIONS.md`. Amend in place — no "Update:" markers.
