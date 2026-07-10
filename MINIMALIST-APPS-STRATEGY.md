# Minimalist Apps Brand — Strategy & Execution Plan

A brand of minimalist apps done extremely well — board games (checkers, hnefatafl), puzzles (sudoku), realtime arcade games (breakout-style), and utility apps (meditation timer) — each free or exactly $1, built continuously by AI, with backend costs pinned near zero at scale.

**Four app archetypes**, all sharing the brand/native layers, differing only in their kit:

1. **Duo turn-based games** (checkers, tafl, scrabble-like) — parlor as-is: free hot-seat + online multiplayer.
2. **Solo turn-based/puzzle** (sudoku, solitaire) — new solo kit, zero backend.
3. **Solo realtime arcade** (breakout, snake-like) — canvas + game-loop kit, zero backend. Realtime is only a problem for *multiplayer* on Firestore; single-player realtime runs entirely on-device and is squarely in scope.
4. **Minimalist utilities** (meditation timer) — no game engine at all; brand shell + native plugins (local notifications, background audio, keep-awake). This archetype is where native beats PWA hardest: iOS Safari can't reliably fire timers/audio in the background, while a Capacitor app can — a genuine product reason for the $1 native version.

The repo already contains most of the hard parts. **`parlor/`** is a hardened, game-agnostic platform (packages `core`/`web`/`server`/`harness`) for turn-based two-player games: server-authoritative Firebase backend (append-only move log, optimistic client sync), shared lobby/auth/push UI, free hot-seat `LocalTransport`, Playwright harness. **`hive/`** is the live proof (free static hot-seat PWA on Cloudflare Pages + multiplayer on Firebase; its functions are ~33 lines of config over `@parlor/server`). **`lex/`** is fully spec'd, not built. Nothing exists yet for single-player games, app-store packaging, monetization, or an automated game pipeline. This plan fills those four gaps.

## Load-bearing decisions (defaults — revisit any deliberately, not by drift)

- **A1 Native path = Capacitor.** Wrap the existing Vite/React apps for both stores. No React Native — it would orphan `@parlor/web` and double every app's cost. (Full what/why/tradeoffs in §1.0.)
- **A2 Pricing = $1 paid-up-front native app; web PWA free.** Zero billing code, zero receipt validation, zero backend — and it *is* the brand ("this app costs a dollar"). Keep the swap cheap via a `usePremium()` seam in `@parlor/native` (hardcoded `true` in paid builds); fallback to free + $1 unlock via RevenueCat only if paid conversion proves terrible.
- **A3 Multiplayer optional per game.** Solo games (sudoku etc.) = pure static Cloudflare Pages, **no Firebase project at all**. Duo games = hot-seat free + online via parlor/Firebase (hive's dual-deploy pattern, `hive-deploy.yml`).
- **A4 AI pipeline = "AI builds, human reviews/ships."** Hand a 1-page brief to Claude Code per app; it drives through factory gates; the human playtests and presses ship. Scheduled autonomy is a later opt-in.

## 1. Platform architecture

### 1.0 Capacitor: what it is and its tradeoffs

Capacitor (from the Ionic team) packages a web app inside a real native iOS/Android app: the React/Vite build runs in a native WebView (WKWebView), with a JS bridge to native APIs via plugins — haptics, share sheet, local notifications, background audio, keep-awake, StoreKit, push. `cap add ios` generates a genuine Xcode project you sign and submit like any native app. One codebase serves the free web PWA *and* the $1 store app.

**Why it fits:** ~100% reuse of hive/lex/parlor/engines/tests; all work stays in TypeScript where the AI factory (and the existing Vitest/Playwright/emulator gates) operate; these app shapes are its best case — board/puzzle games are static-render, and a breakout-level canvas loop runs at 60fps in a WebView without strain.

**Tradeoffs, honestly:**

1. **Still a WebView.** No native UI components; careless scroll/gesture handling feels "webby." Minor for these app shapes, but it's why `@parlor/native` bakes in haptics/safe-area/status-bar polish for every app.
2. **Apple 4.2 "minimum functionality" risk** — Apple rejects apps that feel like repackaged websites. Defenses: fully offline-functional (guaranteed by architecture), native plugin integration, real launch screens, no login walls. Solved for polished Capacitor apps, but it's the one review risk to sequence around (§4 ships the simplest app to the stores first). Minimalist *utilities* (a plain timer) face the same 4.2 scrutiny — "minimal" must still be "unmistakably crafted."
3. **You still own native tooling** — Xcode, signing, provisioning, Gradle, store consoles. Capacitor removes the rewrite, not store ops. (iOS builds from the owner's Mac; Android AAB in CI; no paid macOS CI until cadence demands.)
4. **Two committed native shell projects per app** (`ios/`, `android/`) needing occasional maintenance on Capacitor major bumps — mitigated by generating them from the shared `@parlor/native` config factory so upgrades are mechanical.
5. **Performance ceiling exists** — heavy 3D/particle-storm games would suffer in a WebView. Out of brand scope anyway; if one ever matters, that single title can be native without disturbing the rest.
6. **Startup latency** a hair slower than pure native (WebView boot); imperceptible at this app size.

Alternatives rejected: React Native/Expo (truer native rendering, but rebuilds the entire platform layer), pure Swift/Kotlin (2 codebases per app, incompatible with an AI-built catalog), PWA-only (no store presence, $1 price point nearly impossible).

### 1.1 Workspace shape

**Keep the existing shape**: independent pnpm workspace per game at repo root, source-linked to `parlor/` via `link:` + TS path maps (per root `GAME-SETUP.md`). New apps = new siblings: `sudoku/`, `tafl/`, `breakout/`, `stillness/` (meditation timer). No polyrepo, no npm publishing.

**Four new parlor packages** (same boundary/peer-dep discipline, enforced by `parlor/scripts/check-boundaries.mjs`):

1. **`@parlor/solo`** (`parlor/packages/solo`) — single-player turn-based kit, zero-dep, firebase-forbidden (CI bundle check like hive's `scripts/check-bundle.mjs`). Contains `SoloSession` — a local append-only log mirroring `@parlor/core`'s `LogSession` (`parlor/packages/core/src/logSession.ts`) persisted to IndexedDB → free undo/redo, resume, replay; deterministic daily-seed utilities (engines already forbid `Math.random`); local stats/streaks. No accounts, ever.
2. **`@parlor/arcade`** (`parlor/packages/arcade`) — realtime single-player kit for breakout-style games: fixed-timestep game loop (rAF render, deterministic update tick so replays/tests stay deterministic), canvas helpers, pause-on-background (`visibilitychange`), input abstraction (touch/pointer/keyboard), local high-score store. Zero-dep, firebase-forbidden, shares the same no-accounts discipline as solo.
3. **`@parlor/brand`** (`parlor/packages/brand`) — the brand identity: shared MUI theme, app-shell chrome (header, settings, rules/about screen scaffold, "more from us" cross-promo panel), icon/splash templates. This is what makes N apps feel like one family — games and utilities alike.
4. **`@parlor/native`** (`parlor/packages/native`) — shared Capacitor glue: `capacitorConfig(app)` factory, wrappers for haptics/share/status-bar/safe-area/in-app-review plus local-notifications/background-audio/keep-awake (the utility-app trio the meditation timer needs), `isNative()` + `usePremium()` seams, and an `APP/store/` metadata schema (fastlane-compatible: descriptions, keywords, screenshots, privacy labels) so store assets are factory outputs.

Utility apps like the meditation timer use only `@parlor/brand` + `@parlor/native` — no engine, no session kit. That keeps them tiny while still unmistakably part of the family.

**Capacitor lives per game** (`GAME/packages/app/capacitor.config.ts` + committed `GAME/native/{ios,android}` shells) since each store listing is a separate app. The bundled web build must be fully offline-functional (solo trivially; duo via hot-seat) — core Apple 4.2 defense. iOS signing/archives on the owner's Mac initially; Android AAB in CI (ubuntu). No macOS CI minutes until cadence demands it.

**Hosting matrix**: solo web + duo hot-seat → Cloudflare Pages ($0 forever); duo online → per-game Firebase project (`GAME-zmf`, Blaze); native → stores ($99/yr Apple total, $25 once Google); brand site (`arcade-site/`) → Cloudflare Pages ($0).

## 2. Cost control

**Per-game ledger** (from parlor's actual sync design — 1 callable per move, 2–3 transactional reads + 2–3 writes, 1–2 listener reads per opponent): a completed ~50-move game ≈ 500 reads / 200 writes / 60 invocations → **well under $0.001 per game** at Firestore list prices. Turn-based games generate ~10² ops per *game*, not per second — Firestore is nearly free at this shape.

**Scale tiers** (per title, ~10 games/MAU/mo): 1k MAU ≈ $0–10/mo (daily free tier absorbs most); 10k MAU ≈ $60–100/mo; 100k MAU ≈ $650–1,000/mo — by which point $1 sales at even 1% conversion dwarf it. Recalibrate against the real Firebase usage dashboard after lex soft-launch.

**Guardrails (factory checklist items):**

- Solo games never touch Firebase — no project created; enforced by CI bundle check.
- Per-game Firebase projects (existing pattern) for blast-radius + cost visibility.
- GCP budget alerts at $10 and $50 on every project (add to `GAME-SETUP.md` ⚑ owner steps).
- Listener hygiene: doc/limited-query listeners only; detach on `visibilitychange` (add to `@parlor/web/transport` if absent); lobby queries keep composite index + limits.
- Firestore TTL policy on finished games + move subcollections (~90 days post-completion) — caps storage growth for ~nothing.
- App Check on callables once real traffic exists (abuse, not users, is the realistic cost risk).
- **Leaving Firestore: probably never for turn-based.** Revisit only at sustained >$500/mo — migration target is Cloudflare Durable Objects behind the existing `GameTransport` seam, which is exactly the insurance that makes this a non-emergency. *Multiplayer* realtime (twitch games vs. an online opponent) stays out of brand scope — Firestore economics invert at realtime tick rates. Single-player realtime (breakout) is unaffected: it never touches a server.

## 3. The app factory

**Generator** — finish the deferred `create-parlor-game` as `tools/create-app/` at repo root, **after** exemplars exist for each track (rule of three; see sequencing). Four kinds:

- `--kind solo` (sudoku) → engine + app, `@parlor/solo` + `@parlor/brand` wired, Cloudflare-only deploy, no firebase anywhere.
- `--kind arcade` (breakout) → engine + app on `@parlor/arcade` + `@parlor/brand`, same zero-backend shape.
- `--kind duo` (tafl) → full `GAME-SETUP.md` skeleton: engine/app/functions, firebase config + rules/indexes from parlor template, emulator seed, `GameServerConfig`/`SubmitMoveConfig`/`NotifyConfig` stubs.
- `--kind utility` (meditation timer) → app only, `@parlor/brand` + `@parlor/native`, no engine package.

All stamp: the line-budgeted doc set (CLAUDE/DESIGN/REQUIREMENTS/IMPLEMENTATION/DECISIONS + `check-docs.mjs`), `APP/store/` skeleton, `capacitor.config.ts`, CI/deploy workflows.

**Playbook** (`tools/create-app/PLAYBOOK.md`) — the per-app runbook handed to Claude Code: brief → stamp → engine first (pure TS, fast-check property tests) → board UI against `@parlor/harness` `/dev/gallery` → wire transport/`SoloSession` → gates → human playtests the PR preview URL → ship.

**Quality gates / definition of done** per app (`pnpm validate` + stamped `DONE.md`): typecheck (incl. doc + rules-parity checks), engine unit + property tests, duo-only emulator callable/rules negative tests + two-browser e2e, arcade-only fixed-timestep determinism test (same seed + input trace → identical state), Playwright visual via harness, no-firebase bundle assert (all non-duo builds + duo hot-seat), offline cold-start + Lighthouse PWA pass, store assets present (icon, screenshots, privacy answers — non-duo = "Data Not Collected"), brand theme + "more from us" panel present.

**CI at N apps: stay umbrella monorepo.** Per-app workflows with `paths:` filters (exactly `hive-ci.yml` pattern); an app PR runs only its own ~10 minutes; `parlor/**` changes fan out to all consumers — which is the lockstep guarantee parlor demands. Fine to ~10 apps; collapse to a matrix workflow if it ever hurts. Polyrepo would forfeit the source-linked architecture — rejected.

## 4. Sequencing

1. **Build lex** (fully spec'd, workflows staged, `lex/IMPLEMENTATION.md` is the build plan). Cheapest validation that parlor truly supports a second game + the hardest variant (hidden info). *Exit: lex live; hive+lex green on shared parlor.*
2. **Single-player kit + sudoku web.** Build `@parlor/solo` + `@parlor/brand`; `sudoku/` as first consumer (generator/solver engine, difficulty grading, daily puzzle by seed). Pure Cloudflare. *Exit: first brand title live at $0 infrastructure.*
3. **Capacitor + store pipeline.** Build `@parlor/native`; ship sudoku at $1 to both stores (lowest-risk submission: offline, no accounts — learn any Apple 4.2 pushback on the simplest possible game). While review is pending, build the **meditation timer** (`stillness/`) as the first utility — it exercises exactly the native plugins that justify its $1 native version (background audio, local notifications, keep-awake) — and submit it second. *Exit: two $1 apps in both stores; store ops documented as code.*
4. **Broaden the archetypes, then extract the generator.** Build **breakout** (`breakout/`) as the first `@parlor/arcade` consumer and **hnefatafl** (`tafl/`) manually via GAME-SETUP.md. Then extract `tools/create-app/` from the living exemplars (hive/lex/tafl for duo; sudoku for solo; breakout for arcade; stillness for utility) and validate it by stamping `checkers/` to all-gates-green. *Exit: generator proven on a real game.*
5. **Factory cadence + optional autonomy.** Brand site, backlog of briefs, then (only now) consider a scheduled Routine that drafts the next app's brief/engine PR for review. Revisit pricing data; execute RevenueCat fallback behind `usePremium()` only if needed.

## 5. Store operations reality check

Apple $99/yr (one account, all apps) + Google $25 once; ~1–3 days for first review. **Apple 4.2 (minimum functionality)** is the real risk for wrapped apps — cleared by being fully offline-functional, using native haptics/share/rate via `@parlor/native`, proper launch screen/safe areas, no login wall. **Guideline 4.3 (spam)**: a portfolio of similar board games can trip repetitive-app heuristics — mitigate with genuinely distinct per-app icons/screenshots/descriptions (`@parlor/brand` gives family resemblance; `APP/store/` forces per-app identity). Factory checklist: 1024 icon, iPhone/iPad/Android screenshots, titles/keywords, privacy labels, rating questionnaires, support URL (brand site).

## 6. What NOT to do

No RN rebuild; no per-app backend beyond parlor's shells; no *multiplayer* realtime games on Firestore (single-player realtime like breakout is fine — it's serverless by nature); no ads/subscriptions/consumable IAP ever; no accounts for solo/arcade/utility apps; no premature generator (templates come from living exemplars); no npm publishing/polyrepo; no macOS CI yet; no analytics SDKs in apps (Cloudflare web analytics + store consoles suffice); no N-player scope creep (stays parked).

## Verification

- **Phase 1**: lex's own `validate` gates + hive and lex CI green on shared parlor commits.
- **Phase 2**: sudoku CI asserts no firebase in bundle; Cloudflare deploy smoke checks (per `hive-deploy.yml`); Playwright offline cold-start check.
- **Phase 3**: TestFlight/internal-track install on real devices; App Review approval *is* the 4.2 verification; purchased install runs fully offline on a clean device.
- **Cost model**: after lex soft-launch, read one week of actual Firebase usage and recalibrate §2; a test alert confirms budget-alert wiring.
- **Phase 4**: generator verified operationally — `checkers/` stamped to all-gates-green with <~5 human interventions against `DONE.md`.
- **Standing invariant**: every parlor PR keeps all consumers green; `check-docs.mjs`/`check-boundaries.mjs`/rules-parity stay wired into every game's typecheck.

## Critical files

- `GAME-SETUP.md` (repo root) — canonical new-game checklist; gains solo + native tracks
- `PARLOR-PLATFORM-HARDENING.md` — the plan this continues (its deferred generator = Phase 4 here)
- `parlor/packages/core/src/logSession.ts` — the session model `@parlor/solo` mirrors
- `.github/workflows/hive-deploy.yml` — dual-deploy template every game copies
- `lex/IMPLEMENTATION.md` — Phase 1's ready-to-execute build plan
