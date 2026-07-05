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
