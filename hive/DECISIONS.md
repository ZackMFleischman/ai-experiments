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

- **2026-07-03 — M4 SHIPPED** (PR #28; deploy fixes #29/#30). Gates: validate:m4
  (rules/callable/emulator suites, transport integration, two-browser full-game
  e2e) + full validate green in CI; production Firebase deploy green (hosting,
  8 callables, rules+indexes). Frozen-surface updates in DESIGN/IMPL: engine
  serializeState/deserializeState; games.playerNames, invite summary fields,
  rematchGameId. Stumbles: emulator WebChannel 400s in headless chromium ⇒
  emulator mode forces long polling; mp Playwright must run single-worker; first
  deploy needed the Cloud Billing API enabled and devDependencies stripped from
  the packed functions dir (workspace:* breaks Cloud Build npm).

- **2026-07-03 — M5 SHIPPED** (same PR as this entry). Gates: validate:m5
  (offline/installability e2e vs a real production build) + 55 functions tests
  (exact push payloads per trigger, forfeit sweep with pinned now) + full
  validate green. SW moved to injectManifest (precache + SPA fallback + push
  display/deep-link); pushes are data-only webpush; Firestore persistent cache
  gives the offline read-only lobby. Async clocks: timeControl/deadlineAt/
  deadlineWarnedAt (DESIGN §5.2), hourly forfeitExpired. ⚑ pending Zack: real
  push on a device, iOS home-screen install check, first real OAuth sign-in.

- **2026-07-03 — Bear mode (user request, rides with M6).** A Settings toggle
  reskins the 8 pieces as the 8 extant bear species (persisted in
  localStorage, resolved by `board/pieceArt.tsx`; engine/rules untouched).
  Movement-thematic mapping: brown/queen (crowned), polar/ant (roams), spectacled/
  spider, sun/grasshopper, American black/beetle (climber), Asiatic black/mosquito
  (the look-alike = mimic), panda/ladybug (patches↔spots), sloth/pillbug (flips
  rocks). Same PR adds the always-available piece guide dialog (glyph + rule per
  piece) and back affordances on New Game/Settings.

- **2026-07-03 — Production callables 403 → "internal" (first real game attempt).**
  The 8 callables were first *created* in a failed deploy (run 8, workspace:*
  npm error); retries were *updates*, which never set invoker IAM — and the
  Editor deploy SA can't set it anyway (run 12 said so for forfeitExpired,
  whose scheduler invoker is broken the same way). Fix: hive-deploy.yml now
  repairs invoker bindings idempotently on every deploy (callables public,
  forfeitExpired scheduler-only); ⚑ Zack grants `roles/run.admin` to
  `github-actions-deploy@hive-zmf.iam.gserviceaccount.com`, then re-runs it.

- **2026-07-03 — First-real-game UX batch (user feedback).** games/{id} carries
  `inviteCode` while open (§5.2) and /game/{id} shows a waiting screen (invite
  link + code, live flip on join) instead of an actable board the server would
  reject. Player bars gain names/"(you)"/turn chip; empty boards a first-placement
  hint; the lobby a join-by-typed-code entry; the guide a rules summary. Guide/info
  glyphs are normalized via measured GLYPH_METRICS (getBBox) — board tiles keep the
  reviewed T6.1 art. Long-press (touch) or hover (title) names any piece.

- **2026-07-03 — In-game reachability follow-ups (user feedback).** Settings was
  a route with no inbound link — the lobby gains a gear, and the piece guide
  (reachable mid-game via ?) hosts the bear-mode toggle directly, retitling its
  own list live. Long-press info now arms only on pieces the player *cannot*
  move — a draggable piece never grows a card over its drop targets; the tray
  never does (its presses are placements). Pinch is contained to the board:
  viewport pins page scale (respected installed) and the board svg swallows
  Safari gesture events + multi-touch touchmove (touch-action isn't enough).
