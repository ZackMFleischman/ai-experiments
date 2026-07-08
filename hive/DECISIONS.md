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

- **2026-07-03 — Pillbug pinned-tosser fix + live-sync hardening (user feedback).**
  A one-hive-pinned pillbug had no self-moves, so it wasn't even selectable — its
  power read as broken. Tossers now join movableCells; selecting one raises a toss
  hint (tosses remain taps/drags on the tossed piece, per M3). New `cancelGame`
  callable (§5.3) lets the creator withdraw an open game from the waiting screen.
  SW pushes postMessage `push-sync` to every open client (resync even when the
  Firestore stream died silently — the stuck-board report) and skip the banner
  when a visible client is already on that screen; games also resync on
  visibilitychange. Deploy invoker-repair list gains `cancelgame`.

- **2026-07-04 — Direct challenges (user request: no codes for people already
  played).** Amends decision 9.4: a challenge is an *open* game addressed to a
  past opponent (`challenge` field, both uids in playerIds, no invite doc) via
  `challengeUser`/`respondChallenge`; decline deletes the doc, accept seats +
  activates. Friend list = distinct opponents from your own games (no new
  collection); only shared-game opponents are challengeable (spam guard).
  Challenges don't expire (either side can decline/withdraw anytime).

- **2026-07-04 — iOS icon badge rides the push (user request).** iOS badges
  installed PWAs only from an app/SW context, so the pending-move count can't be
  set while the app is closed unless the push carries it. Functions now compute
  the recipient's actionable count (your-turn + incoming challenges — the exact
  useTurnBadge filter) at send time and attach it to every push as `badge`; the
  SW applies it via `setAppBadge`. Server-computed-per-send over client
  increments: every push self-corrects, no drift. Known gap: acting from the
  game screen leaves the icon stale until the next push or lobby visit.

- **2026-07-04 — Badge covers accepted invites & rematch offers (user request).**
  "Someone accepted" wasn't badgeable when the acceptor moves first, and rematch
  games start active with no accept step. New `activatedBy` on games/* (§5.2,
  frozen-surface amendment): stamped by respondChallenge/joinGame/rematch; a
  move-zero active game activated by the opponent counts as actionable until
  white's first move — state-derived, no per-user seen tracking. Client and
  server share the rule (actionableCount / countActionable). Code invites stay
  unbadgeable for recipients: they're anonymous until joined.

- **2026-07-07 — Pillbug toss gate/stun corrected (user bug report).** The toss
  was rejected whenever both freedom-to-move gate cells were occupied at any
  height, so an embedded pillbug (flanks at ground level) could never throw. A
  toss is a beetle-style climb up over the pillbug and down: only a gate ABOVE
  ground level (both cells stacked to height ≥ 2) blocks it. Both steps now reuse
  the height-aware `canSlide` predicate. Also enforced the full recency rule — a
  pillbug tossed by the opponent's pillbug last turn is stunned and may not toss
  this turn (previously it still could). DESIGN §2.2 + edge-case fixtures updated.

- **2026-07-07 — In-game settings gear + Confirm-move (user request).** Moved
  Bear mode off the lobby /settings screen onto a gear in the game chrome, joined
  by a new "Confirm move" toggle (persisted via a small GameSettings context).
  When on, a move applies to a local preview only; the controller holds the
  pre-move state and submits solely on Confirm (Cancel/tap-out discards, turning
  the setting off flushes a pending move). The Confirm button is hidden when off,
  disabled until a move is staged. Staging suppresses all other board affordances
  so only Confirm/Cancel act. Engine untouched — pure client UX.

- **2026-07-07 — hive adopts the `@parlor/web` platform layer (user request).**
  Phase 2 of putting both hive and lex on parlor (lex shipped first). hive now
  consumes parlor's sync layer instead of its own copies: deleted the duplicated
  twins (`firebase`, `authContext`, `RequireAuth`, `pushState`, `push`,
  `NotificationsSetup`, `screens/InstallCoachMark`) and repointed importers to
  `@parlor/web`. Kept game-side, now built on parlor: `gameApi` (hive's typed
  callables over parlor's `callable` factory — hive's `{color,timeControlDays}`
  payloads don't fit the generic `createGameApi`, so it uses the factory
  directly), `lobby` (hive's white/black `toSummary` over parlor's
  `useMyGames<T>`), `firestoreTransport`, and the containers. `AppSyncProviders`
  is a shim: `configureFirebase({emulatorProjectId:'demo-hive'})` + re-export
  parlor's default. Wiring mirrors lex: `@parlor/web` link dep + tsconfig paths +
  vite/vitest `resolve.dedupe` (incl. `@mui/icons-material`) + fs.allow. Screens
  still hive's (Phase 3 shares the lobby UI); backend untouched (Phase 4).
  Verified: typecheck, 150 unit tests, static+mp builds, firebase-free static
  bundle, and validate:m4 (integration + multiplayer e2e) all green.

- **2026-07-08 — Robust move sync + no game-over on a staged move (user bug).**
  A game-ending move made with Confirm-move on showed "queen surrounded" but
  never reached the backend (or the opponent's phone). Two causes: (1)
  `buildSnapshot` derived `end` from the *staged preview*, so staging the
  winning move fired the beat/overlay and hid the Confirm bar — the move was
  never sent. Fixed by computing end-of-game from committed state only (a stage
  is a preview; confirm submits, then the win shows). (2) `submitMove` sent once
  and silently rolled back on any error. Now the controller classifies
  transient (network/`unavailable`/`internal`…) vs definite rejections, retries
  transient failures with backoff, keeps the optimistic move on-screen, and
  exposes a `syncStatus` ('saving'/'error') + `retryPending()`; GameScreen and
  the (modal) ResultOverlay show a "Saving…/Not saved — Retry" affordance, and
  it auto-retries on `online`. Definite rejections still roll back/resync.
  Engine and callables untouched — pure client transport/UX.
