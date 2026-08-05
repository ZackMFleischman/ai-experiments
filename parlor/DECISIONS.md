# DECISIONS.md — parlor/

Append-only. New entries at the bottom: date, decision, one-line why. ≤8 lines
each. The only in-place edit: when a later entry supersedes an old one, append
`⊘ superseded YYYY-MM-DD — <pointer>` to the dead entry (lint-checked).
Platform decisions made before this file existed live in consumer logs
(mostly `lex/DECISIONS.md`) and stay there; parlor's own log starts here.

---

- **2026-07-11 — Parlor owns its canon** (PORTFOLIO-HARDENING M6). The platform
  half of `lex/DESIGN.md` §4 moved into `DESIGN.md` here (≤120 lines); lex §4
  keeps only lex's consumer stance. Doc set is now CLAUDE + README (≤55 each) +
  DESIGN (≤120) + this file (uncapped), enforced by `scripts/check-docs.mjs`
  over the shared core (`tools/check-docs-core.mjs`) that all eight workspaces
  now wrap — eight drifted copies consolidated, budgets unchanged per app.
