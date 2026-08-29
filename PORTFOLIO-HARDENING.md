# PORTFOLIO-HARDENING.md

The priority-ordered plan for fixing everything found in the 2026-07 portfolio
architecture review (games + parlor + agent-usage meta). One milestone = one
mergeable unit of work with its own gate; later milestones depend on earlier
ones only where stated. Effort tags: **S** (≤ half a session), **M** (a
session), **L** (multi-session).

Placement: repo root, because per-project `check-docs.mjs` keeps closed doc
sets (same reason as `PARLOR-PLATFORM-HARDENING.md`). When a milestone ships,
mark it `✅ SHIPPED (date)` here and log deviations in the most-affected
project's `DECISIONS.md`.

**Status legend:** ✅ shipped · ◐ partially shipped · ○ not started. Progress as
of 2026-08-29: **M0 ✅, M1 ✅, M8 ✅, M2 ◐, M3 ◐, M5 ◐, M6 ◐, M4/M7/M9 ○.** The deferred
items share one cause — they need a runnable environment (full `pnpm install`
per workspace, the Firebase emulator jars, or a GitHub Actions run) or live
owner action (Firebase data migration, store submission) that this session
can't provide. They are annotated in place with what's required to land them
safely; nothing was shipped that couldn't be run and observed green here.

---

## M0 — Remove loom ✅ SHIPPED (2026-07-11, this PR)

LOOM was forked to its own repo; the copy here was dead weight and the
loom-centric root `CLAUDE.md` mis-oriented every fresh agent session.

- [x] Delete `loom/` (339 files) and its workflows (`loom-ci.yml`,
      `loom-preview-cleanup.yml`).
- [x] Rewrite root `CLAUDE.md` as a neutral, current portfolio map: all 11
      projects, parlor-first install order, repo-root doc map, cross-project
      conventions (incl. the one-live-branch-per-workspace rule).
- [x] Strip loom references from `README.md`, `parlor/hive/lex/katmai-bears`
      CLAUDE/READMEs, hive/lex DESIGN + IMPLEMENTATION prose, the
      `GameScreen.tsx` comment, and the four deploy-workflow comments that
      pointed at `loom-ci.yml`. (`hive/DECISIONS.md` keeps its historical
      mentions — append-only log.)

Gate: `grep -ri loom` outside `lex/packages/dict` and `hive/DECISIONS.md`
returns nothing; every edited project's `check-docs.mjs` stays green.

## M1 — App registry + truthful docs ✅ SHIPPED (2026-07-11, this PR)

The root cause behind four separate holes is that "the list of apps" exists
only as hand-copies. Fix the map first; everything later builds on it.

- [x] **Registry**: added `registry/apps.json` (repo root) — one entry per app:
      `name`, `dir`, `kind` (duo/solo/arcade/utility/other), `displayName`,
      `tagline`, `glyph`, `accent`, `webUrl`, `status` (live/built/coming-soon),
      `firebaseProject` (duo only), `linkedParlor`, `workflows`. Plus
      `registry/apps.schema.json` and `registry/check-registry.mjs` validating
      shape and filesystem parity (every `dir`/`workflow`/`linkedParlor`
      exists; every on-disk game dir has an entry; firebaseProject iff duo).
- [x] **CI-coverage meta-check**: `registry-ci.yml` runs
      `registry/check-ci-coverage.mjs` — every game entry has a
      `.github/workflows/<name>-ci.yml` whose `paths` include both `parlor/**`
      and its own dir. Kills the silent-8th-game failure mode.
- [x] **Boundary-lint scope from the registry**:
      `parlor/scripts/check-boundaries.mjs` builds its banned game-scope list
      (`@hive/*`, `@lex/*`, `@checkers/*`, `@tafl/*`, `@sudoku/*`,
      `@breakout/*`, `@stillness/*`) from `registry/apps.json` instead of the
      hardcoded `lex|hive` (graceful fallback if parlor is consumed alone).
- [x] **Family list generated**: `registry/gen-family.mjs` emits
      `parlor/packages/brand/src/family.generated.ts` from the registry;
      `--check` (wired into parlor typecheck + `registry-ci.yml`) enforces
      staleness *and* parity — every app's local `FAMILY` array and
      `arcade-site/index.html` must agree with the registry (name set + live
      hrefs). Brought the three solo arrays back into sync (they'd drifted:
      each was missing Tafl + Checkers).
- [x] **De-status the strategy doc**: stripped the "where we are" prose from
      `MINIMALIST-APPS-STRATEGY.md` (§intro status claims, §4 status verbs)
      and pointed at `BRAND-IMPLEMENTATION.md` as the sole status ledger.
- [x] **Root check-docs**: added `tools/check-root-docs.mjs` (run by
      `registry-ci.yml`) — closed set + line budgets for the repo-root `.md`
      files and for `katmai-bears/` (the two unlinted zones after loom).
- [x] **Close out checkers**: checked the agent-side brand-mark Ship item in
      `checkers/DONE.md` (wine accent + crowned-checker mark are Checkers's
      own); left the deploy-preview item honest (⚑ needs owner Cloudflare
      project + secrets) and surfaced that in `BRAND-IMPLEMENTATION.md`.

Deviations: registry accents corrected to each app's real theme primary
(the review's copy had them shifted); `arcade-site` lists the *full* family
(live as links, unlaunched as spans) so parity is "all games", not "live
only". Logged here rather than a consumer DECISIONS.md since the change is
repo-root infrastructure.

Gate: `node registry/check-registry.mjs`, `gen-family.mjs --check`,
`check-ci-coverage.mjs`, `check-root-docs.mjs`, and
`parlor/scripts/check-boundaries.mjs` all green; desyncing a family list or
dropping a workflow's `parlor/**` filter turns `registry-ci` red.

## M2 — Factory + CI hardening (M) — ◐ mostly shipped (2026-07-11, this PR)

The factory is the force multiplier for "more games"; make it trustworthy, and
stop hand-copying 210-line workflows.

- [x] **Stamp-check CI** (`factory-ci.yml`): on changes to
      `tools/create-app/**`, any exemplar, `parlor/**`, or `registry/**`, a
      matrix job stamps a throwaway app per archetype and runs its `typecheck`
      + `build` (+ unit `test` for the zero-backend kinds; duo unit needs the
      emulator, covered by parlor + duo CI). Guards generator, exemplar drift,
      and the all-green-from-minute-one promise together.
- [x] **Generator robustness** (`tools/create-app/index.mjs`): word-boundary
      identity rewriting (verified: stamping a duo app no longer corrupts
      `hnefatafl`→`hnefa<new>`, while whole tokens like `@tafl/app` still
      rewrite); port rewrite constrained to real port contexts (localhost URL
      / `--port` / `port:` key) instead of the greedy `\b5(1|2)\d\d\b`;
      structured `create-app:done-budget` marker in each exemplar's BUDGETS
      map replaces the literal-string check-docs patch (fails loudly if the
      marker drifts); identity (display/accent/glyph) read from the registry;
      the stamp appends the new app to `registry/apps.json` + regenerates the
      family list.
- [ ] **Reusable workflows** — DEFERRED. Converting the four duo `*-ci.yml`
      and `*-deploy.yml` pairs + three solo/android workflows into
      `workflow_call` templates + shims is a mass refactor of *live deploy
      pipelines* whose gate ("identical job output") can only be verified by
      running GitHub Actions, which this environment can't do. Deferred rather
      than shipped blind — a subtle YAML slip would break all four games'
      production deploys. Do it in a session that can run the Actions.
- [x] **`arcade-site-ci.yml`**: `tools/check-arcade-site.mjs` (HTML sanity +
      internal-link resolution) + `registry/gen-family.mjs --check` (family
      parity). Negative-tested (a broken internal link turns it red).
- [ ] **CI targeting map** — DEFERRED with the reusable-workflow item it lives
      inside (keys the parlor gate on each app's `linkedParlor`, which the
      registry now records, so the data is ready when the template lands).
- [x] **peerDep coherence check** (`registry/check-peerdeps.mjs`, wired into
      `registry-ci`): reads each game's lockfile; hard-fails on a resolved
      major outside parlor's peer range or two versions of one dep in a
      lockfile, warns on cross-game minor drift. Surfaced a real one:
      firebase 12.15.0 (hive/lex) vs 12.16.0 (checkers/tafl) — advisory until
      the next coordinated install (regenerating four lockfiles needs a full
      install pass).
- [x] **Agent skills**: `.claude/skills/new-app/SKILL.md` (wraps create-app +
      PLAYBOOK + DONE flow) and `.claude/skills/ship-game/SKILL.md` (executable
      GAME-SETUP §10–§12 deploy runbook + ⚑ owner checklist).

Gate: factory-ci stamps the archetypes; a deliberate exemplar break turns it
red (generator/exemplar covered by typecheck+build); skills present. The
reusable-template gate is carried by the deferred item above.

## M3 — Platform test integrity (M–L) — ◐ partially shipped (2026-07-11, this PR)

`@parlor/server` is 1,160 LOC of security-critical transaction code with zero
local tests; the "consumers are the oracle" model doesn't scale past two
consumers.

- [ ] **Parlor server emulator suite** — DEFERRED (needs a runnable env). An
      emulator-backed contract suite is the right fix, but authoring + running
      it requires the Firebase emulator jars and a full parlor install, which
      this environment can't provision within its disk/time budget. Must be
      built where the emulator can actually run and be observed green — writing
      1,160 LOC of security-critical test code that never executes here would
      be worse than honest deferral.
- [ ] **Split the god-factory** — DEFERRED, and correctly *gated on* the suite
      above: the plan itself says do it "with the suite above in place". A
      behaviour-preserving split of 447 LOC of transaction code with no
      running tests is exactly the unsafe move to avoid.
- [x] **Deep-import lint**: every game's `check-boundaries.mjs` now bans
      `@parlor/<pkg>/(src|dist|lib)/…` imports (export-map surfaces only), and
      hive/sudoku/breakout/stillness — which had none — gained one, wired into
      their `typecheck`. Verified green across all seven games; the legit
      single-segment subpath exports (`@parlor/web/lobby`, `@parlor/brand/
      icon-template`, …) are untouched.
- [x] **Parity at deploy time**: `check-rules-parity.mjs` now runs inside all
      four duo deploy workflows immediately before `firebase deploy`, so a
      post-lint edit of the rules copy can't ship unchecked (was typecheck-time
      only).
- [ ] **Rules-additions gate** — DEFERRED with the emulator suite (it's a
      rules-test-coverage assertion, only meaningful alongside the running
      rules suite).
- [ ] **Stillness engine extract** — DEFERRED (needs a stillness install to
      typecheck/test the extracted `@stillness/engine` and its `validate:m1`
      property gate; unsafe to land a package extraction unverified).
- [x] **Breakout hygiene**: investigated and recorded in
      `breakout/DECISIONS.md` — `HighScoreStore` (@parlor/arcade) is kept (the
      right arcade abstraction; `StatsStore` models solo daily-puzzle stats, a
      different shape), and the `@parlor/solo` link is retained because it's
      genuinely used (`dayKey`), not vestigial. Neither leg of the either/or
      was the actual state; the decision documents why.

Gate (shipped legs): a `@parlor/*/src` deep import fails typecheck in every
game; the rules-parity re-check blocks any duo deploy on a drifted rules copy.
The suite/split/stillness gates ride with the deferred items above.

## M4 — Hive convergence (M–L) — ○ not started (needs a runnable env)

> **Deferred wholesale.** Every item here replaces hive's live client core /
> forfeit / notify with `@parlor/*` equivalents. hive is the one game with real
> users, and the gate is "hive `pnpm validate` (all six m-gates) green" — which
> can only be established by installing hive + parlor and running the emulator
> e2e suites. Landing a controller/forfeit swap for a live game without those
> suites running is exactly the unsafe change to avoid. Do this in a session
> that can run hive's `validate`.

End the half-migration: hive consumes parlor's callables and lobby but still
forks the client game loop, forfeit, and notify — every parlor bugfix in a
"ported from hive" file has a possible unfixed twin, policed only by a manual
grep convention.

- [ ] **Client core migration**: replace
      `hive/packages/app/src/controller/{GameController,transport,localStorageTransport,useGameController}`
      with `@parlor/core` (`LogSession`, transport seam, localStorage
      transport) — the parlor versions were extracted from these exact files.
      Port hive-specific bits (if any) into hive's sync bindings. lex's hybrid
      (`controller/GameController.ts` + `entries.ts` alongside `@parlor/core`)
      gets the same treatment.
- [ ] **Forfeit generalization**: extend `createForfeitHandlers` with an
      injectable seat-resolution hook (hive's `toMove` is engine color
      `'w'/'b'`, not a seat key); delete `hive/packages/functions/src/forfeit.ts`.
- [ ] **Notify convergence**: hive keeps only `buildPayload`/`isMyTurn` config
      (like lex/checkers/tafl); delete the rest of its
      `functions/src/notify.ts` fork and the duplicate `push-state` test.
- [ ] **Tooling parity**: add `check-boundaries.mjs` to hive; adopt the M2
      reusable CI template (which brings the standalone parlor gate job hive
      is missing); bring `hive/firestore.rules` (40-line ancestor) onto the
      63-line canonical template so all four duo games parity-check against
      the identical base.
- [ ] **Retire the twin convention**: once no live twins remain, remove the
      "grep hive for the twin" rule from `parlor/CLAUDE.md` and demote the
      `// ported from hive` headers to plain provenance (no action implied).

Gate: hive `pnpm validate` (all six m-gates) green on `@parlor/core`; zero
live code twins between hive and parlor (script-checkable: no file in hive
duplicating a parlor export); hive CI structurally identical to the template.

## M5 — Kill the copy tax (M) — ◐ partially shipped (2026-07-11, this PR)

> **Family-list consumption + generation markers shipped; the rest still
> deferred.** The remaining centralization moves (BrandAppProviders / SW
> template) delete code from all seven apps and re-route it through
> `@parlor/brand` — each needs the app's typecheck/build/visual gates run to
> prove the shell still renders.

- [ ] **`@parlor/brand` absorbs the shell plumbing**: `BrandAppProviders`
      (color-mode init/persist/OS-default + `syncStatusBar` + theme +
      `ColorModeContext`) and a configurable `BrandErrorBoundary`
      (reassurance copy injected). All seven apps' `App.tsx`/`ErrorBoundary`
      shrink to game content + one provider import.
- [ ] **Service-worker template**: the duo games' byte-identical-modulo-name
      `sw.ts` becomes a parlor-owned template stamped with injected strings
      (same copy-with-parity model as firestore.rules: physical copy +
      parity check, since the SW must live in the app).
- [x] **Family list consumption**: the three apps that render `<MoreFromUs>`
      (sudoku/breakout/stillness — the duo games don't) now import the
      M1-generated `FAMILY` from `@parlor/brand` and filter out their own
      entry; their hand-kept local arrays and the `gen-family.mjs` transition
      parity check that policed them are deleted. Visible set is byte-identical
      (`MoreFromUs` already shows only `url`-bearing entries), so this is a
      pure dedup — verified via each app's typecheck + build. `arcade-site`
      (static, can't import the module) stays a hand-kept copy, still guarded
      by the arcade-parity leg of `gen-family.mjs --check`. *(The plan's "seven
      arrays" was an overcount — only these three consumers ever existed.)*
- [x] **Generation markers + stale-copy lint**: every audited true-glue copy
      carries a `// stamped-from <exemplar-path>@<git-blob-sha> — regenerate,
      don't hand-sync` header; `registry/check-stamps.mjs` (in `registry-ci.yml`)
      fails when the exemplar's current blob sha has drifted from a copy's
      recorded sha (working-tree shas, so an uncommitted exemplar edit already
      flags), and fails on any `stamped-from` header the manifest doesn't
      sanction. The factory emits the header on stamp, so new copies are born
      tracked. *Deviation — the plan's file list was pruned by a per-file audit*
      (`registry/stamped-manifest.mjs` records it): `functions/src/config.ts`,
      `firestoreTransport.ts`, `gameApi/lobby/JoinFlow/MultiplayerGame`, and
      `vite.config.ts` diverge per-game (seat keys, wire move types, manifest
      identity) and are *banned* from carrying the marker; hive/lex copies of
      `functions/index.ts` (+ hive's `AppSyncProviders/OnlineGames/NewGameFlow`,
      lex's `NewGameFlow`) are pre-factory forks excluded until M4 converges
      them. Tracked today: `sw.ts` ×3, plus checkers' `functions/index.ts` +
      three sync shells, lex's `AppSyncProviders`/`OnlineGames`. Zero-backend
      kinds have no copies yet — their manifests are empty until a second
      family member exists to audit against.
- [ ] **Re-stamp exemplar parity**: after the above, update the factory
      exemplars and re-run factory-ci so new stamps are born deduplicated.

Gate: `App.tsx` diff across sudoku/breakout/stillness is game-content only;
a deliberate edit to an exemplar binding file makes the stale-copy lint flag
every game copy; factory-ci still green.

## M6 — Docs, decisions & platform ownership (S–M) — ◐ partially shipped

- [x] **GAME-SETUP demotion**: header now declares `tools/create-app` +
      `PLAYBOOK.md` the live path and this file the wiring reference; the
      exemplar drift is fixed (living exemplars named as tafl/sudoku/breakout/
      stillness, not hive/lex); the deploy tribal knowledge is folded into the
      executable **ship-game** skill (shipped in M2). *(Listed out of order —
      it was the self-contained item and it leans on the M2 skill.)*
- [ ] **Parlor owns its canon** — DEFERRED (moves `lex/DESIGN.md §4`, a frozen
      surface, into a new budgeted `parlor/DESIGN.md` + `DECISIONS.md` and
      rewires `parlor/scripts/check-docs.mjs`; wants a parlor typecheck run to
      confirm the new closed set).
- [ ] **DECISIONS supersession convention** — DEFERRED (edits every game's
      CLAUDE.md + all eight `check-docs.mjs` copies; batch with the shared-core
      move below).
- [ ] **Budget alignment / shared check-docs core to `tools/`** — DEFERRED
      (consolidating eight drifting copies is the right end state but needs
      each workspace's typecheck run to prove parity).
Gate: parlor typecheck enforces its new doc set; every project's check-docs
green; a platform-design question is answerable from `parlor/` alone. (Only the
GAME-SETUP-demotion leg is shipped; the rest are deferred as noted.)

## M7 — Deploy & identity (L) — ○ not started (owner + live-migration)

> **Deferred — largely owner-only.** The identity consolidation onto a single
> `parlor-zmf` Firebase project is a *live data migration* (export/import of
> hive's real users, a read-both cutover window, decommissioning four projects)
> that requires owner credentials and console access no agent has — it cannot
> be executed or verified here, only planned. The redeploy fan-out
> (`redeploy-consumers.yml`) and registry-driven ops audit are writable as
> workflows/scripts, but their gate ("a parlor fix reaches all live games'
> production") can only be proven by running against the live projects. This
> milestone belongs to a session paired with the owner. The registry's
> `firebaseProject` field is already in place for the collapse.

- [ ] **Redeploy fan-out**: a `redeploy-consumers.yml` dispatch workflow that
      triggers every duo game's deploy from the registry; auto-dispatch it
      when a merge to main touches `parlor/packages/server/**` or
      `parlor/firestore.rules` (security-relevant surfaces must not wait for
      the next per-game deploy).
- [ ] **Identity decision → one shared Firebase project**: consolidate the
      duo games onto a single Firebase project (`parlor-zmf`): one Auth user
      pool (one account, one friends/invite graph, one push-token store
      across all games), per-game Functions codebases (Firebase supports
      multiple codebases per project), and per-game namespaced collections
      (`{game}_games/…` or an `apps/{game}/…` subtree). Do it **now** because
      only hive has real users — the migration cost grows with every launch.
      Steps: DECISIONS entry with the schema design → rules template gains
      the namespace dimension (parity script updated) → migrate hive data
      (export/import + a read-both cutover window) → point lex/checkers/tafl
      (unlaunched) at it directly → registry's `firebaseProject` collapses to
      one entry → decommission the per-game projects.
- [ ] **Registry-driven ops**: the invoker-IAM repair loop and
      billing-API enablement in the deploy template iterate callables from
      config rather than hand-listed names; a `tools/ops/audit.mjs` script
      verifies IAM bindings + deployed-rules parity for the project from the
      registry.
- [ ] **Cross-game surface**: with shared identity, `MoreFromUs` in duo games
      can deep-link a friend challenge into a sibling game — implement the
      minimal version (shared profile doc + per-game presence) to bank the
      product win that justified consolidation.

Gate: a parlor server fix reaches all live games' production without manual
per-game action; one sign-in works across all duo games; hive migration
completes with zero lost games (verified by export diff); old projects
deleted.

## M8 — N-player generalization (L) — ✅ SHIPPED (2026-08-29), ahead of M7

Built as `lex/IMPLEMENTATION.md` §2 M7 (T7.1–T7.18); the milestone record, the
scope decisions and the stumbles are in `lex/DECISIONS.md`. Every checkbox below
landed, and the gate held: the three sibling workspaces needed **no file
changes**, and `lex/e2e/multiplayer/game.spec.ts` passes **unedited**.

> **Resequenced (owner decision, 2026-08-28).** This was sequenced after M7 so
> the seat model would be touched once. It is now going first, for two reasons:
> the coupling is weaker than the original note assumed — M7 is about *which
> Firebase project* and how collections are namespaced, not about seat shape —
> and **lex is `status: "built"` with `webUrl: null`**, so its schema can change
> with no live users and no migration. That is true today and false the moment
> lex launches. M7's own migration cost is unaffected by seat count.
>
> **The acceptance vehicle changed too**: `lex/` rather than a freshly stamped
> title. A real hidden-information game with a shipped UI and a two-browser MP
> suite is stronger proof than a minimal new game, and it does not depend on the
> factory being able to stamp N-player first. Task-level plan lives in
> `lex/IMPLEMENTATION.md` §2 M7; the scope decisions are in `lex/DECISIONS.md`.

**Shape of the generalization** (decided, see `lex/DECISIONS.md` 2026-08-28):
the declared count is a **maximum** with a minimum of 2 — the host may start
early — invitations reserve nothing (**first come, first served**), and seats,
turn order and the deal do not exist until a new `startGame` callable. A
resign/timeout above two players is a **withdrawal**, not a game end.

- [x] **Seat model**: `GameServerConfig.seatKeys` becomes `readonly string[]` and
      gains `players?: {min,max}` (default `{2,2}`). The pre-game becomes a guest
      list (`roster` / `invited` / `declined`, one always-present invite code);
      `startGame` resolves order, deals, and activates, guarded by an
      `expectedRoster` precondition so a late joiner is never locked out.
      Forfeit/timeout withdraws a seat rather than ending the game above 2.
- [x] **Turn order as a platform capability**: `random | first | last | arrange`,
      persisted so every player sees the arrangement before start; `rematch`
      rotates it so the opening advantage circulates. `parseSeatChoice` is kept
      as the per-game wire→intent mapping, so sibling callables are untouched.
- [x] **Result model**: replace binary win/loss/draw with `standings: Seat[][]`
      (best-first, inner arrays = ties); withdrawn players rank below all
      finishers. `LobbySummary` keeps `result` as a deprecated two-seat form
      behind `finalStandings()`, so hive/checkers/tafl need no changes.
- [x] **Client**: `@parlor/web` gains the guest-list surfaces (`GuestList`,
      `GameRoom`, `TurnOrderPicker`, `InvitationReceived`) as strictly additive
      3+ components; `WaitingForOpponent` / `InviteLinkView` / `ChallengeReceived`
      are not modified. `GameHud` extends past two seats.
- [x] **Rules + registry**: `firestore.rules` needs **no change** — invited uids
      already sit in `playerIds`, so the `array-contains` read gate and the lobby
      index carry over. Registry entries gain `players: {min,max}`.
- [x] **Notify**: fan-out (`invited`, `player-joined`, `game-started`); turn
      pushes go to the next player only, so a 4-player game is not 3× the noise.

Gate (met): 2-player games unchanged — every validate suite green on the
generalized platform, **with no file changes in `hive/`, `checkers/` or `tafl/`**
and `lex/e2e/multiplayer/game.spec.ts` passing unedited; lex plays a full
3-player game end-to-end in `lex/e2e/multiplayer/room.spec.ts` (three browsers,
link join + code join, start-early, a withdrawal mid-game, and the standings
podium); the factory takes `--kind duo --players 4` and stamps a registry entry
that `check-registry` accepts.

Two carried forward rather than claimed: the room e2e proves **3** seats end to
end, not 4 — the seat-count generality is covered by the engine's property suite
over 2/3/4 and by the 4-seat gallery fixtures, and a fourth browser would have
bought a slower gate rather than a new failure mode. And `--players 4` stamps
the registry range only: the cloned ruleset still declares the exemplar's seats,
which the tool now says out loud.

## M9 — Duo CI wall-clock (S–M) — ○ not started

Hive CI runs ~14 min on every PR — too slow. The time is structural, not
irreducible; the fixes below cut wall-clock without deleting a gate (all four
duo games share this shape, so land it in the M2 reusable CI template, not
per-game). Grounded in the current `hive-ci.yml` + hive `validate` chain:

- [ ] **Stop double-running typecheck+unit.** The `checks` job runs
      `typecheck && test`; `validate:m0` then runs `typecheck && test && e2e`
      *again* on the critical-path `validate` job. Have `validate` assume the
      `checks` gate (drop the re-run) or drop the `checks` job and let the
      split `validate` jobs cover it — the duplicated typecheck+unit is pure
      critical-path waste.
- [ ] **Parallelize the `validate:m0..m5` chain.** It's serial (`&&`). Split
      into concurrent CI jobs — engine property sweep (m1/m2), app+hot-seat
      e2e + visual/ux (m3), emulator integration + MP (m4), offline (m5) —
      so wall-clock falls to the longest single gate, not their sum.
- [ ] **Tier property-test fidelity by trigger.** `HIVE_PROP_GAMES=500` runs
      the engine sweeps at full size on *every PR* (m1 and m2, 500 games
      each). Drop PR runs to a smaller sample (e.g. 100–150) and keep the full
      500 on push-to-main + a nightly `schedule:` run — fidelity stays where a
      regression must not slip through, PRs get fast feedback.
- [ ] **Boot the emulator once for m4+m5.** Each `firebase emulators:exec` is
      a fresh emulator boot; m4 and m5 pay it separately. Run the emulator-
      backed suites under a single `emulators:exec` (or a start/stop around the
      job) so the boot + seed import is paid once.
- [ ] **Share the install across jobs.** Both jobs install parlor+hive from
      scratch; a single setup job (pnpm-store cache warm + Playwright browser
      cache keyed on the lockfile) that the split jobs restore avoids
      re-resolving on every parallel job.

Gate: hive PR CI wall-clock materially down (target ≤ ~7 min) with **no gate
removed** — only re-timed, parallelized, or fidelity-tiered; the full 500-game
sweep + all emulator/e2e coverage still runs on main and nightly. Baked into
the M2 reusable duo CI template so all four duo games inherit it.

---

**Sequencing summary**: M1 → M2 unblock everything (registry + trustworthy
factory); M3 → M4 make the platform safe to change (tests, then the last
migration); M5 → M6 cut the ongoing copy/context tax; M8 → M7 are the two
structural bets, now in that order: N seats goes first because lex is still
unlaunched and its schema is free to change only until it ships, while M7's
identity migration costs the same whenever it happens. Each milestone merges
independently with the standard rule:
typecheck + tests + affected validate suites green, and a DECISIONS entry for
anything non-obvious. M9 (CI wall-clock) is independent — do it whenever the
14-min duo CI hurts most, ideally folded into M2's reusable template.
