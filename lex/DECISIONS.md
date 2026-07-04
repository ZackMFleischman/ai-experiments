# DECISIONS.md — lex/

Append-only. New entries at the bottom: date, decision, one-line why. ≤8 lines each.
Milestone SHIPPED entries follow the same format (date, gates run, deviations,
stumbles). Pre-build design decisions 1–12 live in DESIGN.md §9 — this log starts
at build time. Post-v1 ideas go here as one-liners tagged `post-v1`.

---

- **2026-07-04 — Project adopted; docs are the deliverable of PR #1.** DESIGN.md +
  IMPLEMENTATION.md authored from an analysis of shipped hive (M0–M5 + user-feedback
  fixes). Documentation policy adopted verbatim from hive (IMPLEMENTATION.md §7):
  closed doc set, CI-enforced budgets, this file is the only doc that grows.

- **2026-07-04 — Shared code strategy: port into `@lex/platform`, extract later**
  (DESIGN §4). Hive is live and doc-frozen; cross-workspace linking is friction
  without a second stable consumer. Platform is generic by construction (machine
  check: no `@lex/engine` imports); promotion to a repo-root shared workspace and
  hive's migration onto it is tagged `post-v1`.
