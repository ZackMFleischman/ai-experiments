# DECISIONS — Stillness (append-only)

> The only in-place edit: when a later entry supersedes an old one, append
> `⊘ superseded YYYY-MM-DD — <pointer>` to the dead entry (lint-checked).

## 2026-07-10 — M0 agent side SHIPPED: the whole utility (strategy Phase 3c)

- Gates run: typecheck+docs lint, 19 tests (timer machine, app flows,
  mocked-bridge native wiring, store listing), build + bundle check,
  validate:visual (30 captures, checks clean). Parlor 124 / sudoku 37 / lex /
  hive lockstep via CI.
- **No engine package.** The domain is ~60 lines of clock arithmetic;
  `src/timer/timer.ts` keeps the purity discipline (injected `now`) without
  a costume workspace. First deliberate deviation from the solo shape.
- **Zero audio assets.** The bell is synthesized WebAudio (three decaying
  partials); the backgrounded bell is a local notification scheduled at
  projected end +1 s so a foreground finish cancels it first. Ambient
  background audio deferred to M2 — the `BackgroundAudio` bridge contract in
  `@parlor/native` is fixed, the plugin choice is the M2 decision. (3c's
  "exercises background-audio" lands half now, half in M2, deliberately.)
- **Early End counts what it was**: records `elapsedMs`, not the planned
  duration; Back abandons without recording.
- Sit's `fixture` prop exists solely for the gallery's paused/done states —
  interior states unreachable through props; inert in production routes.
- Store identity `com.zmfapps.stillness`, categories HEALTH_AND_FITNESS /
  LIFESTYLE, $0.99 (A2). ⚑ appId + support domain final at first upload.
- MoreFromUs populated both directions with sudoku (both have live web
  URLs); the plan's "≥2 brand titles public" read as web-public — revisit
  the store-facing copy when both are store-live.

- **2026-07-11 — house design language adopted.** Repo-root
  `DESIGN-PRINCIPLES.md` now governs UI, encoded in `@parlor/brand`
  (GameHud play header coherent by player count, accent-derived
  palette + board tokens, MoreFromUs demoted to a footer). The Sit screen's chrome title is now the wordmark; the progress ring strokes `theme.palette.primary` instead of a hardcoded hex. Home's cross-promo renders as the quiet brand footer.
