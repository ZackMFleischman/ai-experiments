# DECISIONS.md — lex/

Append-only. New entries at the bottom: date, decision, one-line why. ≤8 lines each.
Milestone SHIPPED entries follow the same format (date, gates run, deviations,
stumbles). Pre-build design decisions 1–12 live in DESIGN.md §9 — this log starts
at build time. Post-v1 ideas go here as one-liners tagged `post-v1`.

---

- **2026-07-04 — Project adopted; docs are the deliverable of PR #39.** DESIGN.md +
  IMPLEMENTATION.md authored from an analysis of shipped hive (M0–M5 + user-feedback
  fixes). Documentation policy adopted verbatim from hive (IMPLEMENTATION.md §7):
  closed doc set, CI-enforced budgets, this file is the only doc that grows.

- **2026-07-04 — Shared code strategy: port into `@lex/platform`, extract later**
  (DESIGN §4). Hive is live and doc-frozen; cross-workspace linking is friction
  without a second stable consumer. Platform is generic by construction (machine
  check: no `@lex/engine` imports); promotion to a repo-root shared workspace and
  hive's migration onto it is tagged `post-v1`.

- **2026-07-04 — SUPERSEDED ↑: platform is repo-level `parlor/` from day one**
  (owner decision). Own workspace at the repo root (`@parlor/core|web|server|
  harness`), lex consumes via `link:` + TS paths (IMPLEMENTATION §1); lex-only
  to start, hive migration stays `post-v1`. Named for what it hosts: parlor games.

- **2026-07-04 — Board layout + dictionary are per-game options (owner req).**
  `dictionaryId` moved out of `Ruleset` into `GameOptions`; v1 ships rulesets
  `classic` + `modern` (WWF-style premiums) and dictionaries `enable1` (~173k)
  + `2of12inf` (12dicts everyday list, ~82k) — both public domain. Pickers in
  New Game (FR-6/7); options shown to the invitee pre-accept (FR-10).

- **2026-07-04 — REQUIREMENTS.md added to the doc set** (owner request): the
  numbered FR/NFR feature inventory, budget 250 (IMPLEMENTATION §7 table);
  IMPLEMENTATION budget raised 650→700 for the parlor wiring + second ruleset/
  dictionary tasks. Parlor keeps its own two ≤55-line docs.

- **2026-07-04 — SHIPPED M0 (T0.1–T0.8).** Gates: typecheck (docs + boundaries +
  strict tsc) + unit tests green in both workspaces; ping green vs demo-lex
  emulators; Playwright smoke 9/9 at 3 viewports; `validate:m0` chains them; CI
  ported (parlor / checks / validate jobs). Deviations: T0.5 ships minimal
  deny-all firestore.rules (three-tier rules are T4.3); e2e package named
  `lex-e2e` (a bare `e2e` collides with hive's in pnpm filters). Stumbles:
  fast-check predicates must return boolean/undefined — a vitest matcher's
  return value failed a seed property.

- **2026-07-04 — SHIPPED M1 (T1.1–T1.11).** Gates: 111 engine tests green;
  `validate:m1` = 1000-game property run (~40s) over both rulesets, fc seed
  pinned in CI. Deviations: `modern` premium census pinned 8TW/12DW/16TL/24DL
  with a plain-star center (WWF-style); engine exchange appends returned tiles
  to the bag end (server re-shuffle is a T4.5 transport event, so invariant-5
  replay is exact from bagOrder + moves at engine level); playerView throws on
  out-of-range seats. Stumbles: none — fixtures were generated, then pinned.

- **2026-07-04 — SHIPPED M2 (T2.1–T2.5).** Gates: 31 dict tests; `validate:m2`
  = DAWG build (enable1 480 KB / 2of12inf 227 KB, ≤800 KB) + full suite incl.
  the pinned played-out ENABLE game. Deviations: 2of12inf `%`/`!` marker words
  KEPT (markers stripped — they are real playable words per the 12dicts docs);
  sync loader exported at subpath `@lex/dict/node` to keep the frozen browser
  surface exact; provenance in `words/README.md` (outside the doc gate's walk).
  Stumbles: norvig.com blocked by the proxy — vendored enable1 from the
  dolph/dictionary mirror, 2of12inf from the official SourceForge zip.

- **2026-07-04 — SHIPPED M3 (T3.1–T3.13).** Gates: 101 app + 20 parlor tests;
  validate:m3 = visual sweep (24 gallery entries × 3 viewports × 2 themes with
  machine checks) + §4.2 ux flows + tap AND drag full-game e2e at 390×844 vs
  the production build; full `pnpm validate` green. Deviations: per-task gallery
  review consolidated into T3.11's first pass (3 accepted deviations logged in
  the checklist); result-overlay stats omit duration (no clock exists pre-M4).
  Stumbles: jsdom hid two real-browser bugs (tray wedged after drag hand-off —
  no pointerup after capture release; skin read a context, not the MUI theme).

- **2026-07-04 — Production Firebase project `lex-zmf` registered** (owner, per
  hive §5.6 steps 1–4): web-app config committed as `VITE_FIREBASE_*` in
  `packages/app/.env` (public identifiers). `.firebaserc` gains a `prod` alias;
  `default` stays `demo-lex` so emulators/CI keep running fully offline (§8.9) —
  deploys use `--project prod`. VAPID public key committed too
  (`VITE_FIREBASE_VAPID_KEY` — M5's push setup), and the deploy service
  account (Editor + roles/run.admin) is stored as the GitHub Actions secret
  `FIREBASE_SERVICE_ACCOUNT_LEX_ZMF` — hive §5.6 setup complete; nothing
  manual blocks M4.

- **2026-07-05 — SHIPPED M4 (T4.1–T4.10).** Gates: full `pnpm validate` green —
  22 negative-case rules tests, 32 callable/submitMove emulator tests, 5 real-SDK
  integration tests + the two-browser e2e (bingo, count-only exchange, reload
  resume, resign, rematch, challenge/decline) under validate:m4; 186-shot visual
  sweep. Deviations: the client ADOPTS server snapshots instead of replaying the
  log (hidden info — 'sync' entries; §3.3); private/bag gains `state`, racks gain
  `n` (§6.2 amended); resign allowed off-turn. Stumbles: reconcileSlots collapsed
  duplicate faces; snapshot fetches racing a commit needed a monotonic gate.

- **2026-07-05 — SHIPPED M5 (T5.1–T5.6).** Gates: validate:m5 = offline/
  installability e2e vs a production SW build; 18 new functions tests (exact
  payloads incl. word+score copy, badge fan-out, token pruning, pinned-now
  forfeit sweep); title-badge asserted in the two-browser e2e; full validate
  green. Deviations: sw.ts stays in the app (injectManifest builds from the
  app's srcDir — cross-workspace SW source is brittle; port map said parlor);
  badges/offline lobby largely landed with T4.7/T5.1, T5.4 closed the gates.
  ⚑ remaining for Zack: real push on a device + iOS home-screen check.

- **2026-07-05 — T6.4: pinch-zoom re-enabled; skin contrast is now a test.**
  Dropped `maximum-scale=1/user-scalable=no` (Lighthouse a11y): the board
  already consumes its gestures via `touch-action: none`, so page zoom only
  affects menu screens. Premium-label + tile-letter contrast (≥4.5:1, every
  skin × mode) moved from eyeball checklist to a unit test; classic/walnut
  inks went full black/white and walnut-light TW + high-contrast-dark TL/TW
  shifted to pass. Scores: PWA 1.0, a11y 1.0, SEO 1.0, BP 0.96, perf 0.89
  (throttled first load; TBT 0). DAWGs 480/227 KB vs NFR-6's 800 KB cap.

- **2026-07-05 — SHIPPED M6 (T6.1–T6.7): v1 code-complete.** Gates: full
  `pnpm validate` green (m0–m5 + unit + typecheck); Lighthouse PWA/a11y/SEO
  1.0; 228-shot gallery review ×3 rounds. Skins classic/walnut/high-contrast
  (persisted, contrast unit-enforced ≥4.5:1); rejected-move toast; lobby
  empty state + stacked chips; U+2212 scores; one-row actions at 390px;
  pinch-zoom re-enabled; card thumbnail exported. Stumble: Settings read
  mode from context, not theme — the M3 lesson, caught by dark captures.
  ⚑ Zack: prod deploy + DNS, first real game, PersonalWebsite card PR.

- **2026-07-05 — Board polish from first real-game feedback (Zack).** Four UX
  fixes: (1) preview total badge removed — it duplicated the main word chip and
  covered cells (bingo ★ moved onto the chip); (2) last-play highlight gets its
  own skin var `--lex-tile-lastplay-edge` (green ≠ pending gold — opponent tiles
  read as part of your staging) and hides while any tile is staged; (3) zoom-out
  floor = fit, bottoming out snaps to auto-fit (board could vanish off-screen);
  (4) board viewport is `user-select: none` (press-drag highlighted labels).

- **2026-07-05 — Drag drops snap to cells, ghost under the finger (Zack).**
  The ghost floated 40px above the finger and drops hit-tested at the ghost's
  center — releases landed a cell off from what you'd expect. Now the ghost
  rides under the finger and SNAPS into the free cell it would land in
  (position + scale match the cell exactly); release commits the snapped cell,
  so a tile always stays where the snap shows. No snap target (occupied cell /
  off-board) sends the tile home — occupied drops previously kept a staged
  tile put silently; home matches what the un-snapped ghost communicates.

- **2026-07-07 — Score-bar polish + move-clock visibility (Zack).** From a real
  game: (1) player-bar names show first names, falling back to first + last
  initial then full name only as far as needed to disambiguate — long names were
  wrapping the bar and top-justifying the score; (2) the side-to-move seat gets a
  live move-clock (compact "2d"/"18h"/"soon" + clock icon, fits even colliding
  "Mike B."/"Mike C." at 390px); (3) the lobby deadline chip now rides waiting
  cards too, so the opponent's clock is visible. Shared `game/clock.ts` feeds both;
  `deadlineAt` (already in schema) surfaced through `GameMeta` to the game screen.

- **2026-07-07 — In-game back button + branded boot loading screen (Zack).**
  (1) The score-bar now leads with a back arrow that leaves the live board for
  the lobby (multiplayer) / landing (hot-seat) — reuses the `onBackToLobby`
  already threaded from both game containers for the end-of-game overlay, so no
  new plumbing. (2) Landing shows the LEX hero + spinner while full-mode auth
  resolves instead of flashing the sign-in buttons at an already-signed-in
  player, then redirects to their games; guarded deep-links already covered by
  RequireAuth's own loading state.

- **2026-07-07 — Action-row hierarchy: Play is the CTA, Resign moves to ⋯
  (Zack).** From a real game: every action button was the same compact size and
  a `flex:1` spacer pushed Resign to the far-right edge — the natural primary-CTA
  slot on mobile — giving a rare, game-ending action false prominence while Play,
  the every-turn action, had none. Redesigned `GameActions` by frequency ×
  consequence: Play is a full-width contained CTA that grows to dominate the row;
  Recall is its outlined undo-pair; Exchange/Pass stay low-emphasis; Resign moves
  into an overflow (⋯) menu (error-colored, still behind its confirm dialog, still
  enabled off-turn via `canResign` per §2.3). Matches Words With Friends / Scrabble
  GO. Action set unchanged (DESIGN §7.2 still Play/Recall/Exchange/Pass/Resign);
  only placement changed. Tests/e2e that clicked Resign now open the menu first.

- **2026-07-07 — Lobby/landing UI shared into `@parlor/web/lobby-ui` (Zack).**
  Phase 1 of putting both hive and lex on parlor. The lobby presentation was
  originally copy-adapted per game (DESIGN §4); it's now a shared, game-agnostic
  seam: the grouped game list (`makeLobby` with injected thumbnail / caption /
  empty-state slots), the turn badge (`makeTurnBadge`), invite/waiting/challenge
  screens, the landing shell (hero slot), and the join card (details slot). Each
  lex `screens/*` file is now a thin wrapper binding lex's slots; its lobby
  summary EXTENDS a generic seat-index `LobbySummary`. Kept game-side: the
  new-game `NewGameForm` — hive's color+expansions vs lex's board+dictionary make
  it all-slots, so sharing it would be net-negative; only its generic pieces
  (`friendsFrom`, `InviteLinkView`, `Friend`) moved. Wiring: new `./lobby-ui`
  subpath export + tsconfig path; added `@mui/icons-material` to the vite/vitest
  `resolve.dedupe` so linked parlor icon components don't pull a second React
  (§8.11). hive migration onto this seam is Phase 3.

- **2026-07-08 — Top-level ErrorBoundary; stale-chunk auto-reload (fix: lex
  white screen).** The app had no error boundary, so anything thrown while
  rendering blanked the page to white. The game route is uniquely exposed: it is
  the only route behind lazy chunks (`SyncProviders` + `MultiplayerGame`). After
  a redeploy rotates the chunk hashes the running JS still references (and
  `cleanupOutdatedCaches` purges the old ones), the dynamic import throws through
  the unguarded `<Suspense>` — surfacing as "click into a game after the opponent
  moved → white screen, sometimes" (opening from a push navigates straight to
  `/game/:id`). Fix: `src/ErrorBoundary.tsx` wraps the whole tree in `main.tsx`.
  A dynamic-import failure is transient, so it hard-reloads once (a `sessionStorage`
  timestamp + 10s window stops a deterministic failure from looping); any other
  error falls back to a self-contained reload card (plain DOM, no MUI/providers —
  those may be what threw). Twin exists in hive (same missing boundary) — flagged
  for a follow-up port.

- **2026-07-08 — Added `nwl2023` dictionary (NASPA Word List 2023).** Third
  registry entry alongside `enable1`/`2of12inf` (DESIGN §5.4). Vendored from
  `scrabblewords/scrabblewords`; its source carries a definition per line, so the
  word file is the first column (`cut -d' ' -f1`), one word per line, LF — kept
  reproducible rather than hand-edited. 196,601 words; DAWG 541 KB (≤800 KB
  budget). Unlike the other two it is **copyrighted** (© NASPA); README states
  the terms and it ships at the owner's explicit direction, which DESIGN §5.4
  already reserved as the owner's call.

- **2026-07-08 — Off-turn planning: stage tiles (rack + board), reorder, and
  shuffle while the opponent moves.** Previously the whole tray was `disabled`
  off-turn, freezing even reorder/shuffle. Now staging is decoupled from
  committing: `placeAt`/`selectRackSlot` gate on `ended()` (game over) instead of
  `interactive()`, so you can lay out a planned play off-turn; `interactive()`
  still gates Play/Exchange/Pass, so nothing commits until your turn (DESIGN §7.2
  step 1 amended; same off-turn-action precedent as resign, §2.3). `disabled` now
  means the hard lock at game over only. Recall policy is **recall-everything**:
  a new game state (the opponent's move) already clears `pending` in `syncRack`,
  so any staged plan — including a tile on a cell the opponent just filled —
  returns to the rack wholesale rather than trying to partially reconcile.
  `buildPreview` now reads the acting seat's rack (off-turn `game.toMove` is the
  opponent), and the engine state is never touched by staging.

- **2026-07-08 — Firestore rules + indexes track a canonical parlor reference,
  enforced by a parity lint (hardening Phase 1).** `parlor/firestore.rules` +
  `parlor/firestore.indexes.json` are the canonical source of truth for the
  security model (declarative files, not TS — they live at the parlor root;
  parlor's boundary/doc lints ignore non-`.md`, non-source files). **Firebase
  requires the rules/indexes files to live inside each game's own project dir** —
  a `../parlor/...` path in `firebase.json` is rejected by `emulators:exec`/deploy
  ("outside of project directory"), which CI caught — so the physical file can't
  be shared. Each game keeps its own copy; `scripts/check-rules-parity.mjs`
  (wired into `pnpm typecheck`) fails if a game's rules drift from or weaken the
  base (base tiers must appear verbatim as a subsequence) or its indexes differ.
  lex is a hidden-information game: it keeps the base three tiers
  (users/games/moves/invites/deny-all) verbatim and ADDS `racks/{uid}`
  (owner-read) + `private/*` (server-secret), which the reference documents as a
  copy-in snippet — parity allows added tiers, forbids dropped/weakened ones. The
  negative-path rules-unit-tests remain the behavioral gate. DESIGN §4 updated.

- **2026-07-08 — submitMove is now the @parlor/server createSubmitMove shell
  (parlor hardening Phase 2).** The transaction shell (auth / envelope /
  preconditions / concurrency guard / moveCount+deadline bookkeeping /
  `pendingDrawOffer` clear / opponent push) moved to `@parlor/server`; lex injects
  only its engine `advance` (score → applyMove → exchange re-shuffle → public
  snapshot + rack doc + private bag doc as sub-writes) via `lexSubmitConfig` in
  submitMove.ts. The shell's unconditional `pendingDrawOffer` delete is a harmless
  no-op for lex (no draws). lex does **not** call `createDrawCallables` (its draws
  arise from tied scores in the engine, not an offer) — capabilities are opt-in by
  inclusion, so no draw endpoints ship. Wire contract (`move` field), doc shapes,
  and privacy invariant (exchange log carries a count only) unchanged. DESIGN §4/§6.3
  updated; submit-move + callables emulator tests are the equivalence gate.
