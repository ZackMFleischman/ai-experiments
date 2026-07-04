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
