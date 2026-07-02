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
