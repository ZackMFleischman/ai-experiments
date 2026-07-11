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
of 2026-07-11: **M0 ✅, M1 ✅, M2 ◐, M3 ◐, M6 ◐, M4/M5/M7/M8/M9 ○.** The deferred
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

## M5 — Kill the copy tax (M) — ○ not started (needs app installs to verify)

> **Deferred.** The centralization moves (BrandAppProviders / SW template /
> family-list consumption) delete code from all seven apps and re-route it
> through `@parlor/brand` — each needs the app's typecheck/build/visual gates
> run to prove the shell still renders. The one piece that *is* verifiable
> standalone — the "generation markers + stale-copy lint" — is a good first
> slice for a follow-up (a repo-root lint comparing each stamped binding file's
> recorded exemplar sha to the exemplar's current sha; no app install needed).
> The M1 family generator already did the hardest prerequisite (the registry-
> driven `family.generated.ts`), so M5's family-consumption step is now just
> deleting the seven local arrays and importing the generated module.

- [ ] **`@parlor/brand` absorbs the shell plumbing**: `BrandAppProviders`
      (color-mode init/persist/OS-default + `syncStatusBar` + theme +
      `ColorModeContext`) and a configurable `BrandErrorBoundary`
      (reassurance copy injected). All seven apps' `App.tsx`/`ErrorBoundary`
      shrink to game content + one provider import.
- [ ] **Service-worker template**: the duo games' byte-identical-modulo-name
      `sw.ts` becomes a parlor-owned template stamped with injected strings
      (same copy-with-parity model as firestore.rules: physical copy +
      parity check, since the SW must live in the app).
- [ ] **Family list consumption**: apps and `arcade-site` consume the
      M1-generated registry module (`family.generated.ts` / generated HTML
      fragment); delete the seven hand-kept `FAMILY` arrays and the M1
      transition parity check.
- [ ] **Generation markers + stale-copy lint**: every legitimately per-game
      binding file the factory stamps (`app/src/sync/*`, `sw.ts`,
      `functions/src/{config,index}.ts`, `vite.config.ts`) gets a
      `// stamped-from <exemplar-path>@<git-sha> — regenerate, don't hand-sync`
      header; a repo-root lint (in `registry-ci.yml`) warns when the exemplar
      has changed since a copy's recorded sha, replacing silent hand-propagation
      with a visible diff queue.
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

## M8 — N-player generalization (L) — ○ not started (sequenced after M7)

> **Deferred, and correctly last.** This touches the seat model across parlor
> server + web + rules + every game's validate suite, and its acceptance gate
> is a stamped N-player title playing a full game end-to-end via the emulator
> MP test. It is unsafe and pointless to start before M3's server test suite
> exists (nothing would catch a regression) and before M7 settles the seat/
> identity model — the plan's own sequencing note. Needs the full runnable
> stack; deferred until the earlier milestones land in a verifiable env.

- [ ] **Seat model**: `GameServerConfig.seatKeys` becomes length-N;
      create/join/challenge/rematch lifecycle handles partial fill (min/max
      players, start-when-full vs. host-starts), seat ordering, and per-seat
      deadlines rotating through N seats. Forfeit/timeout removes a seat
      rather than ending the game at N>2.
- [ ] **Result model**: replace the binary win/loss/draw with a ranking
      (`placements: seatKey[]` + optional draw groups); update rematch,
      notify copy (`NotifyConfig` triggers gain seat context), and stats.
- [ ] **Client**: `@parlor/web` lobby-ui renders N seat plaques
      (`GameHud` already switches on player count — extend past 2);
      transport/log-replay is seat-count-agnostic already (verify with a
      property test).
- [ ] **Rules + registry**: `playerIds` checks in the rules template are
      already array-based — extend the parity template's invite tier for
      multi-join; registry entries gain `players: {min,max}`.
- [ ] **Prove it**: ship a minimal 3–4 player title through the factory
      (e.g. a trick-taking or racing game from `tools/create-app/briefs/`)
      as the acceptance vehicle — the epic isn't done until a stamped N-player
      game passes the standard gates.

Gate: 2-player games unchanged (all existing validate suites green on the
generalized platform); the N-player acceptance title plays a full game
end-to-end via emulator MP test; factory stamps `--kind duo --players 4`.

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
migration); M5 → M6 cut the ongoing copy/context tax; M7 → M8 are the two
structural bets (identity, then N seats) in the order that touches the seat
model once. Each milestone merges independently with the standard rule:
typecheck + tests + affected validate suites green, and a DECISIONS entry for
anything non-obvious. M9 (CI wall-clock) is independent — do it whenever the
14-min duo CI hurts most, ideally folded into M2's reusable template.
