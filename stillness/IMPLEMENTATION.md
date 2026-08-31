# IMPLEMENTATION — Stillness

Status ledger. Task detail lives in the milestone sections; design rationale
in `DESIGN.md`; the brand-wide plan in repo-root `BRAND-IMPLEMENTATION.md`
(this app is its Phase 3c).

## §1 Gates (every PR)

`pnpm typecheck` (docs lint + tsc) · `pnpm test` (timer machine, app flows,
mocked-bridge native wiring, store listing) · `pnpm validate:m1` (500-run
timer property sweep) · `pnpm build` (PWA + no-firebase bundle check) ·
`pnpm validate:visual` (registry × 3 viewports × 2 themes — read the
captures). Parlor and all consumers stay green in lockstep.

## §2 Milestones

### M0 — the app, whole — agent side SHIPPED 2026-07-10; ⚑ owner remainder

Everything in one slice (the app is small enough that milestones inside it
would be ceremony): timer machine + bell, Home/Sit over `@parlor/brand`,
stats via `@parlor/solo`, gallery + visual sweep (30 captures), PWA + bundle
check, committed native shells + brand-template icons/splash, validated
store listing, utility-trio wiring (keep-awake, notification bell; ambient
audio deferred to M2), 4.2 defenses, CI/deploy/android workflows.
Remaining ⚑: Cloudflare `stillness-zmf` project confirm; store ops per
`GAME-SETUP.md` §12 (submitted second, while sudoku's review pends —
strategy §4).

### M1 — polish from real sits

Feedback-driven candidates: interval bell option, end-of-sit note field
(local only), Lighthouse pass on the built PWA, app-store screenshot set
from the gallery.

### M2 — ambient sound (the BackgroundAudio exemplar)

Pick/build the native plugin behind `@parlor/native`'s `BackgroundAudio`
contract (the wrapper API is already fixed); ship 2–3 synthesized/looped
soundscapes; verify true background playback on both platforms. This is the
archetype-level deliverable, not just a feature.

## §7 Docs policy

Closed set, line-budgeted, enforced by `scripts/check-docs.mjs` (wired into
`pnpm typecheck`): README 25, CLAUDE 55, REQUIREMENTS 250, DESIGN 500,
IMPLEMENTATION 400, DECISIONS append-only/uncapped. Amend sections in place —
no "Update:" markers.
