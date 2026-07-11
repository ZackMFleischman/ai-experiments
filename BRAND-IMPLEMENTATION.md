# Minimalist apps brand — implementation plan

The working plan that executes `MINIMALIST-APPS-STRATEGY.md`. The strategy owns
the *what and why* (archetypes, Capacitor, pricing, cost model, factory shape);
this doc owns the *how, in what order, and where we are* — the same relationship
`PARLOR-PLATFORM-HARDENING.md` (all five phases shipped 2026-07-08) had to the
platform. Its deferred `create-parlor-game` generator lives on here as Phase 4.

> Placement note: repo root, for the same reason as the strategy and the
> hardening plan — `parlor/` and every app keep closed, line-budgeted doc sets
> (`check-docs.mjs`), so cross-cutting plans live above them.

Conventions: each phase gets a status marker and, when a slice merges, a short
**Shipped** note recording gates run + deviations (the hardening plan's
discipline). **⚑ marks owner-only steps** — accounts, signing, store consoles,
spend — the agent surfaces these and waits rather than guessing.

## Principles

- **Exemplar-first.** No generator until each archetype has a living exemplar
  (rule of three). Templates are extracted from shipped apps, never invented.
- **Zero-backend is enforced, not promised.** Every non-duo app ships a
  `check-bundle.mjs` that fails the build if "firebase" appears in dist
  (sudoku's is the reference); no Firebase project is ever created for them.
- **Lockstep green.** Every `parlor/**` PR keeps all consumers green — hive
  (377 tests), lex (426), sudoku (30) today; each new app joins the set.
  Parlor only grows in service of a consumer's task, so new packages land in
  the same PR series as their first consumer.
- **One PR per slice**, docs amended in the same PR, never weaken a test.
- **Front-load store risk.** The simplest possible app (sudoku: offline, no
  accounts) meets App Review first, so Apple 4.2 lessons are learned cheaply.

---

## Phase 1 — second duo title on shared parlor — ✅ SATISFIED

The strategy's Phase 1 ("build lex") predates this doc: lex is built, its CI
and dual-deploy (Cloudflare hot-seat + Firebase multiplayer) are live, and the
platform-supports-a-second-game validation is done — hive and lex have stayed
green in lockstep through all five hardening phases. What remains is a product
call, not an engineering gate: ⚑ lex soft-launch/promotion (tracked in
`lex/IMPLEMENTATION.md`). The strategy's cost-model recalibration (§2) keys
off one week of real Firebase usage after that launch — a standing item, not a
blocker for anything below.

---

## Phase 2 — solo kit + first brand title — ✅ M0+M1 SHIPPED 2026-07-10 · ⚑ + M2 open

> Shipped (PR #83, with the strategy doc itself): **`@parlor/solo`** —
> `SoloSession` (append-only local log with an undo/redo cursor, mirroring
> `LogSession`'s fold discipline), `dayKey`/`hashSeed`/`mulberry32` seed
> utilities, account-free `StatsStore` with day-streak math; zero-dep,
> DOM-free, storage injected via `KeyValueStorage`; 32 tests incl. a
> fast-check model property. **`@parlor/brand`** — `createBrandTheme` with
> per-app accent injection, safe-area-aware `AppShell` chrome, `MoreFromUs`
> cross-promo panel; react/MUI as peer deps; 7 tests. **`sudoku/`** — bitmask
> MRV engine with a uniqueness guarantee (`validate:m1` 40-puzzle sweep),
> daily-seed app with notes/undo/stats/offline PWA, `check-bundle.mjs`,
> `sudoku-{ci,deploy}.yml`. Gates: parlor 100 / sudoku 30 / lex 426 / hive
> 377, all green. Detail in `sudoku/DECISIONS.md`.

> Shipped (M1 agent side, same day): sudoku `/dev/gallery` over
> `@parlor/harness` (8 fixed-seed fixtures), the `sudoku-e2e` workspace —
> `validate:visual` walks 3 viewports × 2 themes with machine checks, wired
> into CI with a screenshot artifact — and a Lighthouse pass on the built PWA
> (99/100/100/100 after fixes). The a11y fixes landed at the brand layer on
> purpose: `AppShell`'s content area is now the `<main>` landmark and
> `MoreFromUs` titles are `<p>` not `<h6>`, so every future brand app
> inherits them. Detail in `sudoku/DECISIONS.md`.

**Remaining to close the phase** (task detail lives in
`sudoku/IMPLEMENTATION.md` §2):

- ⚑ confirm the `sudoku-zmf` Cloudflare Pages project + custom domain if
  wanted (PR previews already deploy).
- **Sudoku M2 — polish from real play** (feedback-driven; candidates listed
  in its IMPLEMENTATION.md).
- **`MoreFromUs` stays a stub** until ≥2 brand titles are public, then
  populate both directions. Whether hive/lex retrofit `@parlor/brand` is
  deliberately parked — decide when tafl (Phase 4) proves the brand shell on
  a duo game; no forced restyle of shipped apps.

**Exit (strategy):** first brand title live at $0 infrastructure.
**Size of remainder:** ~1–2 days. **Risk:** low.

---

## Phase 3 — `@parlor/native` + the $1 store pipeline — agent side SHIPPED · ⚑ store ops open

Three slices; 3a+3b are one PR series (parlor packages need a consumer), 3c
starts while sudoku sits in App Review.

### 3a. `@parlor/native` (the package) — ✅ SHIPPED 2026-07-10

> Shipped (PR #85): **`@parlor/native`** — Capacitor reached through the
> injected runtime bridge (`globalThis.Capacitor`), never an import, so every
> wrapper no-ops cleanly in a plain browser and the free PWA bundle stays
> byte-identical; `@capacitor/*` are optional peers the consuming app installs
> for `cap sync`. `capacitorConfig(app)` factory pins the shell conventions
> (webDir, `APP/native/{ios,android}` paths, androidScheme, splash);
> haptics/share/status-bar/in-app-review + the utility trio wrappers;
> `isNative()` + `usePremium()` (A2: premium *is* the native platform);
> fastlane-compatible `StoreListing` schema + validator (the CI tripwire for
> metadata a store would bounce). `check-boundaries.mjs` gains rule (d):
> Capacitor imports confined to `native/`. 17 mocked-bridge tests; parlor 117
> green. Background-audio wrapper is contract-only until stillness (3c).

**Ship:**
- `capacitorConfig(app)` factory — one place that pins Capacitor conventions
  so `ios/`/`android` shell upgrades stay mechanical (strategy §1.0 tradeoff 4);
- plugin wrappers: haptics, share, status-bar/safe-area, in-app-review, plus
  the utility trio — local-notifications, background-audio, keep-awake — that
  the meditation timer exists to exercise;
- `isNative()` + `usePremium()` seams (`usePremium()` hardcoded `true` in paid
  builds — decision A2; the RevenueCat fallback stays hypothetical);
- the `APP/store/` metadata schema (fastlane-compatible: description,
  keywords, screenshot manifest, privacy labels) so store assets are checked,
  reviewable factory outputs.

**Discipline:** every wrapper must no-op cleanly in a plain browser — the free
PWA build's behavior is unchanged by the package existing. Capacitor packages
are peerDependencies (parlor's react/firebase rule); `check-boundaries.mjs`
extended so Capacitor imports live only in `@parlor/native`. Unit tests run
against a mocked bridge (real-device behavior is verified in 3b, not unit
tests).

### 3b. sudoku → both stores at $1 — ✅ agent side SHIPPED 2026-07-10 · ⚑ store ops open

> Shipped (PR #86): committed `sudoku/native/{ios,android}` shells from the
> factory (config stays in `packages/app`; the CLI loads the import-free
> `@parlor/native/capacitor-config` subpath); icons/splash rendered into both
> shells from the new `@parlor/brand/icon-template` + sudoku's `mark.mjs`
> (`pnpm native:assets`); `store/listing.ts` validated in unit tests, privacy
> = Data Not Collected; 4.2 defenses wired native-gated (haptics, share,
> review-from-3rd-win, status-bar sync) — web UI byte-stable, gallery
> untouched; `sudoku-android.yml` builds the unsigned release AAB on ubuntu;
> native track runbook = `GAME-SETUP.md` §12; `support-site/` placeholder
> (support + privacy pages, `zmf-apps.pages.dev`) with its own deploy
> workflow. Gates: parlor 117 / sudoku 37 / build + bundle check / m1.
> Remaining ⚑ (GAME-SETUP.md §12): Apple + Play accounts, signing, consoles,
> price, questionnaires, screenshots; confirm appId + support domain before
> first upload; on-device 4.2 checklist pass.

- `sudoku/packages/app/capacitor.config.ts` from the factory; committed
  `sudoku/native/{ios,android}` shells; icons/splash from `@parlor/brand`
  templates; `store/` metadata with privacy labels = "Data Not Collected".
- CI builds the Android AAB (ubuntu); **no macOS CI** — ⚑ iOS archive/sign/
  submit runs from the owner's Mac, with the runbook committed as a new
  **native track in `GAME-SETUP.md`** (same lift-the-tribal-knowledge move
  the deploy notes got).
- ⚑ owner: Apple Developer enrollment ($99/yr, covers all apps), Play console
  ($25 once), signing certs/profiles, $1 price point, rating questionnaires.
- A **support URL is required at listing time** — the strategy assigns the
  brand site to Phase 5, so 3b ships a one-page placeholder on Cloudflare
  Pages (⚑ domain) and Phase 5 replaces it. Called out here because the
  strategy's sequencing glosses this dependency.
- Apple 4.2 defense checklist (all verified on device before submission):
  offline cold-start, native haptics/share/rate wired, real launch screen +
  safe areas, no login wall.

**Verification (strategy):** TestFlight/internal-track installs on real
devices; App Review approval *is* the 4.2 verification; a purchased install
runs fully offline on a clean device.

**Size:** 3a ~2 days; 3b ~2–3 days agent-side + owner store ops.
**Risk:** medium — App Review is the one uncontrollable; everything else is
mechanical.

### 3c. `stillness/` — the meditation timer, first utility — ✅ agent side SHIPPED 2026-07-10

App only: `@parlor/brand` + `@parlor/native`, no engine, no session kit
(strategy archetype 4). It exercises exactly the plugins that justify a $1
native version — background audio, local notifications, keep-awake — the
things iOS Safari can't do reliably in a PWA. Free web on Cloudflare, $1 in
both stores; own doc set + bundle check like every non-duo app. Submitted
second, while sudoku's review is pending — a *utility* clearing 4.2 tells us
the review posture for the whole archetype ("minimal must still be
unmistakably crafted").

> Shipped (PR #87): the whole utility in one slice — pure clock-injected
> timer machine + synthesized bell (zero audio assets; the backgrounded bell
> is a local notification scheduled at projected end +1 s), Home/Sit over
> `@parlor/brand`, day-streak stats via `@parlor/solo`, gallery + visual
> sweep (30 captures), committed `native/{ios,android}` shells + sage
> ring-and-dot icons from the brand template, validated `store/listing.ts`,
> keep-awake + notification wiring under mocked-bridge tests, 4.2 defenses,
> `stillness-{ci,deploy,android}.yml`. 19 tests. Ambient background audio is
> deliberately M2 (`stillness/IMPLEMENTATION.md`) — the `BackgroundAudio`
> bridge contract is fixed, the plugin choice is the M2 decision.
> `MoreFromUs` populated both directions with sudoku (both web-public).
> Detail in `stillness/DECISIONS.md`. ⚑ store ops per GAME-SETUP.md §12.

**Exit (strategy):** two $1 apps in both stores; store ops documented as code.

---

## Phase 4 — broaden the archetypes, then extract the generator — ✅ agent side SHIPPED 2026-07-11

### 4a. `@parlor/arcade` + `breakout/` — ✅ SHIPPED 2026-07-11

> Shipped (PR #88): **`@parlor/arcade`** — fixed-timestep loop (deterministic
> tick, injected driver), recordable/replayable input traces, one-way
> pause-on-background, letterbox/DPR canvas math, HighScoreStore over the
> injected storage seam; zero-dep, DOM-free, 31 tests. **`breakout/`**
> (store name **Bricks** — Breakout is Atari's trademark): pure fixed-tick
> engine with the archetype gate as a 200-trace property + golden trace
> (`validate:m1`), canvas court over the kit loop, brand shell, 6-entry
> frozen-fixture gallery (36 captures), native shells + validated listing +
> 4.2 defenses, `breakout-{ci,deploy,android}.yml`. MoreFromUs updated both
> directions. Gates: parlor 155 / breakout 28 / bundle check / visual.
> ⚑ store ops per GAME-SETUP.md §12. Detail in `breakout/DECISIONS.md`.

Kit: fixed-timestep game loop, canvas helpers, pause-on-background, input
abstraction with traces, local high-score store. The archetype's key test —
**same seed + same input trace → identical end state** — is breakout's
merge gate.

### 4b. `tafl/` — duo, built manually via `GAME-SETUP.md` — ✅ agent side SHIPPED 2026-07-11

> Shipped (PR #88): Brandub 7×7 — pure kernel (50 tests incl. seeded
> random-game property), one LogSession fold for hot-seat and online
> (log-replay transport + snapshot regression check), **seats ARE sides**
> (seatKeys = engine toMove — no mapping layer; parlor shells + forfeit
> sweep work unmodified), functions as @parlor/server shells with 19
> emulator tests incl. the rules negative suite, first duo title on
> `@parlor/brand` (theme + AppShell + lobby-ui slots ≈ zero bespoke chrome
> — the hive/lex retrofit now has evidence: cheap, batch it with other
> work), hot-seat Playwright smoke + 36-capture gallery,
> `tafl-{ci,deploy}.yml`. The friction log lives in
> `tafl/IMPLEMENTATION.md` §3 — it drove 4c's design. ⚑ GAME-SETUP §11
> owner steps (tafl-zmf project, secrets); native wrap deliberately
> post-v1 (`tafl/DECISIONS.md`).

### 4c. `tools/create-app/` — the generator, extracted last — ✅ SHIPPED 2026-07-11

> Shipped (PR #88): four `--kind`s stamped **from the living exemplars**
> (duo=tafl, solo=sudoku, arcade=breakout, utility=stillness) — taken
> literally: the stamp arrives all-gates-green *playing the exemplar's
> game*, and `PLAYBOOK.md` walks the builder through morphing the
> game-specific core while every other gate stays green (tafl's friction
> log said the mechanical 90% is pure templating; the generator stamps
> exactly that). Identity (names/ids/accent/ports) rewritten; docs stamped
> as fresh budgeted skeletons + **`DONE.md`** (added to the check-docs
> closed set); workflows stamped at the repo root. **Validation:**
> `checkers/` stamped (88 files, green untouched: 76 tests + all lints
> before a single edit) and morphed to American checkers per the PLAYBOOK
> — see the Shipped note in `checkers/DECISIONS.md` for gates and the
> interventions count. Briefs backlog in `tools/create-app/briefs/`.

**Exit (strategy):** generator proven on a real game. ✅

---

## Phase 5 — brand site + factory cadence — ✅ agent side SHIPPED 2026-07-11

> Shipped (PR #88): **`arcade-site/`** — the brand site (family listing =
> the web ends of the MoreFromUs links, support + privacy), replacing
> `support-site/` **at the same Cloudflare Pages project** (`zmf-apps`) so
> the store listings' support/privacy URLs never move; still static,
> zero-script, zero-backend. Backlog of 1-page briefs
> (`tools/create-app/briefs/`: snake, solitaire, breathe) — the factory
> cadence is: pick a brief → stamp → PLAYBOOK → owner playtests the
> preview → ship. ⚑ remaining owner items below.

- ⚑ The opt-in scheduled Routine that drafts the next app's brief/engine PR
  (decision A4) stays un-created on purpose — autonomy is an owner opt-in;
  the factory loop above works human-triggered today.
- ⚑ Revisit pricing with real store data; execute the RevenueCat fallback
  behind `usePremium()` only if paid conversion proves terrible (A2).
- ⚑ Optional custom domain for the brand site (zmf-apps.pages.dev works).

---

## Standing gates (every PR, regardless of phase)

- typecheck + test lockstep for parlor and **all** consumers;
  `check-boundaries.mjs` / `check-docs.mjs` / rules-parity stay wired into
  every workspace's typecheck.
- Non-duo apps: bundle check proves no firebase; no Firebase project exists.
- ⚑ GCP budget alerts at $10/$50 on every duo Firebase project
  (`GAME-SETUP.md` owner steps).
- Decisions land in the owning app's `DECISIONS.md`; shipped slices get their
  **Shipped** note here in the same PR.

## Sequence

**2(M1) → 3a+3b → 3c → 4a ∥ 4b → 4c → 5 — all agent-side work shipped
2026-07-11.** What remains is the ⚑ owner ledger: store ops for
sudoku/stillness/breakout (GAME-SETUP §12), the tafl/checkers Firebase
projects + secrets (§11), lex soft-launch + cost recalibration (§Phase 1),
sudoku M2 polish from play, pricing revisit with real data, and the A4
autonomy Routine if ever wanted. New titles now run the factory loop:
brief → `tools/create-app` stamp → PLAYBOOK → playtest the preview → ship.
