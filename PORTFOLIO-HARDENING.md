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

## M3 — Platform test integrity (M–L)

`@parlor/server` is 1,160 LOC of security-critical transaction code with zero
local tests; the "consumers are the oracle" model doesn't scale past two
consumers.

- [ ] **Parlor server emulator suite**: `parlor/packages/server/test/` gets an
      emulator-backed contract suite (a minimal synthetic `GameServerConfig` +
      engine) covering create/join/cancel/challenge/respond/rematch/resign,
      `createSubmitMove` (turn order, deadline, terminal states),
      `createDrawCallables`, and `createForfeitHandlers` — including the
      negative paths (wrong seat, expired deadline, double-join, replayed
      move). New `parlor` CI job runs it with the emulator jar cache.
- [ ] **Split the god-factory**: break `server/src/games.ts` (447 LOC) into
      per-lifecycle modules (`create.ts`, `join.ts`, `challenge.ts`,
      `rematch.ts`, `resign.ts`) behind the same `createGameCallables`
      facade — no consumer-visible change, do it with the suite above in
      place.
- [ ] **Deep-import lint**: extend each game's `check-boundaries.mjs` (and
      add one to hive/sudoku/breakout/stillness, which lack it) to ban
      `@parlor/<pkg>/src/…` imports — consumers may only use the export-map
      surfaces.
- [ ] **Parity at deploy time**: run `check-rules-parity.mjs` inside the
      deploy workflow template immediately before `firebase deploy` (today
      it's typecheck-time only; a post-lint edit of the rules copy would ship
      unchecked).
- [ ] **Rules-additions gate**: a check (parity script extension) asserting
      each duo game's functions test dir contains negative-path rules unit
      tests for every `match` block the game *added* beyond the parlor base —
      turning the "additions are covered by convention" assumption into a
      gate.
- [ ] **Stillness engine**: extract `packages/app/src/timer/` into
      `@stillness/engine` (pure, clock-injected) and add a `validate:m1`
      property gate (session arithmetic, bell schedule, streak rollover) so
      the utility archetype has the same shape as the others — and the
      factory's `utility` stamp inherits it.
- [ ] **Breakout hygiene**: drop the vestigial `@parlor/solo` link, or adopt
      `StatsStore` in place of the `HighScoreStore` overlap — pick one and
      record it in `breakout/DECISIONS.md`.

Gate: parlor CI red on any server regression without any consumer suite
running; games.ts split lands with the suite green before/after; deep-import
violation fails typecheck; stillness `validate:m1` green.

## M4 — Hive convergence (M–L)

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

## M5 — Kill the copy tax (M)

Seven of ~10 shell files per app are stamped clones that drift by hand.
Centralize what's genuinely generic; mark what's legitimately per-game so
staleness is detectable.

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

## M6 — Docs, decisions & platform ownership (S–M)

- [ ] **Parlor owns its canon**: give parlor a budgeted `DESIGN.md` (the
      platform rationale + port map, moved out of `lex/DESIGN.md §4`) and
      `DECISIONS.md`; update `parlor/scripts/check-docs.mjs`'s closed set;
      leave a pointer in lex. Platform tasks stop requiring a 724-line
      consumer doc in context, and lex stops de-facto owning platform
      decisions.
- [ ] **GAME-SETUP demotion**: rewrite the header to declare
      `tools/create-app` + `PLAYBOOK.md` the live path and this file the
      wiring reference; fix the exemplar drift (it names hive/lex as
      references; the factory's living exemplars are tafl/sudoku/breakout/
      stillness); fold the deploy tribal knowledge (invoker-IAM repair,
      billing-API enablement, `npm pkg delete devDependencies`) into the M2
      `ship-game` skill so it's executable, not just readable.
- [ ] **DECISIONS supersession convention**: superseded entries get a
      `[SUPERSEDED → see YYYY-MM-DD entry]` prefix edited onto the old entry
      (append-only for additions, tombstoned for reversals); add the rule to
      each game's CLAUDE.md and a grep-based nudge to `check-docs.mjs`
      (flag files containing "supersedes" whose target lacks a tombstone).
      Retrofit tafl's Brandub/11×11 pair as the exemplar.
- [ ] **Budget alignment**: normalize `check-docs.mjs` budgets across
      projects (hive gains a REQUIREMENTS entry or documents why not; DONE.md
      becomes a standard factory-stamped entry everywhere the factory runs);
      the shared check-docs core moves to `tools/` so the eight copies stop
      drifting.

Gate: parlor typecheck enforces its new doc set; every project's check-docs
green; a platform-design question is answerable from `parlor/` alone.

## M7 — Deploy & identity (L)

Two structural ops holes: green platform fixes don't reach production until
each game independently redeploys, and four Firebase projects mean four
identities per player and linearly-scaling ops.

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

## M8 — N-player generalization (L)

The last parked epic: the platform models exactly two seats and a binary
result. Do it after M7 (the seat/identity model is touched once, not twice)
and before any >2-player title is designed against the old shape.

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

---

**Sequencing summary**: M1 → M2 unblock everything (registry + trustworthy
factory); M3 → M4 make the platform safe to change (tests, then the last
migration); M5 → M6 cut the ongoing copy/context tax; M7 → M8 are the two
structural bets (identity, then N seats) in the order that touches the seat
model once. Each milestone merges independently with the standard rule:
typecheck + tests + affected validate suites green, and a DECISIONS entry for
anything non-obvious.
