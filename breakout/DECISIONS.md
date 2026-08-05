# DECISIONS — Bricks

> Append-only. New entries at the bottom: date, decision, one-line why.
> ≤8 lines each. Milestone SHIPPED entries follow the same format (date,
> gates run, deviations, stumbles). Post-v1 ideas go here as one-liners
> tagged `post-v1`. The only in-place edit: when a later entry supersedes an
> old one, append `⊘ superseded YYYY-MM-DD — <pointer>` to the dead entry (lint-checked).

---

- **2026-07-11 — store name is "Bricks", directory stays `breakout/`.**
  Breakout is Atari's trademark; the strategy/plan name the archetype and
  directory, the store listing needs a clean name. appId
  `com.zmfapps.bricks` (⚑ final only at first upload).

- **2026-07-11 — engine rng is a state field, not a generator object.**
  `nextRand(cursor) → [value, cursor']` keeps the whole game JSON-plain and
  makes the determinism property (same seed + trace → same end state)
  trivially true by construction — nothing hides outside the fold.

- **2026-07-11 — collision = axis probes against the grid, one hit/tick.**
  Ball step (≤0.95u) ≪ brick cell (14×7u), so tunneling can't happen and a
  swept-AABB solver would be complexity without behavior. Golden trace pins
  the outcome.

- **2026-07-11 — pause never auto-resumes** (kit-level decision, arcade
  `pauseWhenHidden`): coming back to a hidden tab mid-flight kills runs;
  resume is the player's tap. One-way by design.

- `post-v1`: in-app TraceRecorder capture (share a bug as a replayable
  trace); synthesized sound + haptic-style toggle; canvas particles on
  brick break.

- **2026-07-11 — M0 SHIPPED** (PR #88, Phase 4a slice). Gates: typecheck /
  28 unit tests / build+bundle check / validate:m1 (200 traces) /
  validate:visual (36 captures) green locally and in CI. Deviations: one
  branch for all Phase 4+5 slices (session constraint) instead of one PR
  per slice. Stumbles: TS 5.x inferred-type-predicate narrowing in
  levels.ts fallback; canvas fillStyle union vs the structural context
  twin.

- **2026-07-11 — house design language adopted.** Repo-root
  `DESIGN-PRINCIPLES.md` now governs UI, encoded in `@parlor/brand`
  (GameHud play header coherent by player count, accent-derived
  palette + board tokens, MoreFromUs demoted to a footer). Play's score/level/lives row is now the shared `GameHud`; the court reads `theme.palette.board.surface`. Home's cross-promo renders as the quiet brand footer.

- **2026-07-11 — keep `HighScoreStore` (@parlor/arcade); keep the
  `@parlor/solo` link (PORTFOLIO-HARDENING M3).** The two are not a
  duplication: `HighScoreStore` (@parlor/arcade) is the arcade high-score
  persister — the right store for an action game; `StatsStore`
  (@parlor/solo) aggregates account-free *solo daily-puzzle* results, a
  different shape (opaque difficulty buckets, per-day records) that would
  be the wrong abstraction here. So we do **not** adopt StatsStore. The
  `@parlor/solo` link is not vestigial either: `Play.tsx` imports `dayKey`
  from it (the local-day helper arcade's `highScores.ts` documents but
  doesn't re-export). Follow-up candidate (not now): promote `dayKey` to a
  shared seed surface so arcade titles need no @parlor/solo link at all.
