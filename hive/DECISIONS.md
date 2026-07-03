# DECISIONS.md — hive/

Append-only. New entries at the bottom: date, decision, one-line why. ≤8 lines each.
Milestone SHIPPED entries follow the same format (date, gates run, deviations,
stumbles). Pre-build design decisions 1–17 live in DESIGN.md §9 — this log starts at
build time. Post-v1 ideas go here as one-liners tagged `post-v1`.

---

- **2026-07-02 — Documentation policy adopted** (IMPLEMENTATION.md §7): closed doc
  set with CI-enforced line budgets; this file is the only doc that grows; the
  implementation plan self-consumes as milestones ship (task tables collapse to
  SHIPPED entries here).

- **2026-07-02 — M0–M3 ship without any Firebase console setup** (authorized
  deviation): no cloud project exists yet, so T0.6 drops its ⚑ half — CI is GitHub
  Actions only (typecheck + unit layers + e2e); emulators run against `demo-hive`.
  Two tasks added: T3.11 hot-seat persistence (localStorage behind `GameTransport`;
  refresh resumes) and T3.12 static deploy of the hot-seat PWA (LocalTransport
  default, no firebase in bundle, minimal manifest — subset of T5.1) via Cloudflare
  Pages project `hive` (GitHub Pages fallback). Firebase Hosting/M4+ unaffected.

- **2026-07-02 — M0 SHIPPED** (PR #22). Gates: validate:m0 (typecheck+docs lint,
  unit layers incl. functions-vs-emulator, Playwright smoke ×3 viewports) green in
  CI. Deviations: no Firebase console (see above). Stumbles: CI webServer needed
  `--host 127.0.0.1`; Playwright pinned ~1.56 to match the sandbox chromium.

- **2026-07-02 — M1 SHIPPED** (PR #23). Gates: validate:m1 green in CI (1000-game
  property run, fc seed pinned) + a clean 10,000-game run locally. Deviations:
  none; frozen API implemented verbatim. Stumbles: long synchronous fc runs starve
  vitest's worker RPC — the suite yields a macrotask between games; legalMoves
  memoized by state identity for suite speed.

- **2026-07-02 — M2 SHIPPED** (PR #24). Gates: validate:m2 green in CI (19 pinned
  UHP edge-case fixtures, all-expansions + repetition full-game fixtures, property
  suite ×2 rule sets). Judgment call: toss steps use the height-1 gate rule (piece
  travels at height one, per DESIGN §2.2/FAQ) — stricter than the beetle rule; and
  legalMoves drops tosses that duplicate a legal self-move (UHP canonicalization).

- **2026-07-03 — Production Firebase project `hive-zmf` registered** (DESIGN §5.6
  steps 1–3 done by Zack): web-app config committed as `VITE_FIREBASE_*` in
  `packages/app/.env` (public identifiers). `.firebaserc` gains a `prod` alias;
  `default` stays `demo-hive` so emulators/CI keep running fully offline —
  deploys use `--project prod`. VAPID key + deploy service account still pending.

- **2026-07-03 — DESIGN §5.6 one-time setup complete**: VAPID public key committed
  (`VITE_FIREBASE_VAPID_KEY` in `packages/app/.env`); CI deploy service account
  (`github-actions-deploy`, Editor role on `hive-zmf`) created, its JSON key stored
  as GitHub Actions secret **`FIREBASE_SERVICE_ACCOUNT_HIVE_ZMF`**. The M4+ deploy
  job authenticates by writing that secret to a file and pointing
  `GOOGLE_APPLICATION_CREDENTIALS` at it, then `firebase deploy --project prod`
  (login:ci tokens are deprecated). No deploy workflow exists yet — agent work.

- **2026-07-03 — M3 SHIPPED** (PR #26), incl. authorized T3.11 (localStorage
  persistence) and T3.12 (static PWA deploy — the loom Cloudflare token DID
  provision the new `hive` Pages project, so no GitHub Pages fallback). Gates:
  validate:m3 (58 app tests, tap + drag full-game e2e at 390×844, visual sweep
  120 captures, ux frames) + full validate green; first screenshot review pass
  committed. Judgment calls: board tiles draw as inline polygons for exact grid
  geometry (sprite symbols everywhere else); enemy pieces are selectable exactly
  when tossable, which makes tosses plain taps/drags on the tossed piece.

- **2026-07-03 — M4 build/deploy decisions**: one codebase, two builds — default
  `vite build` stays the firebase-free static hot-seat PWA (Cloudflare `hive`);
  `--mode multiplayer` (VITE_HIVE_MODE=full) mounts the lazy firebase stack and
  ships to Firebase Hosting via the new main-merge deploy job in hive-deploy.yml
  (`--project prod`, smoke-checked at hive-zmf.web.app). Functions build is an
  esbuild bundle so the workspace @hive/engine dep is inlined for deploy.
  Emulator-only email/password test sign-in backs dev/e2e; production UI stays
  Google-only. Deploy auth per the 2026-07-03 service-account entry.
