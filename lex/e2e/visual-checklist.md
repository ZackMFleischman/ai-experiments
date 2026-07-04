# Visual review checklist — lex/

Reviewed against every `validate:visual` / `validate:ux` capture (IMPLEMENTATION §0.2.5).
Per-screen sections grow as screens land; global items first. Accepted deviations
are logged at the bottom with date + reason, and deleted when fixed.

## Global

- Tile letters and point indexes legible at placement zoom on the phone viewport;
  at fit-view the board reads as orientation (word shapes visible), not mush.
- Premium squares distinguishable in light **and** dark and across tile skins;
  DL/TL/DW/TW text labels present so color is never the only signal.
- **Pending vs committed tiles** unmistakable in both themes (lift + gold edge);
  pending tiles never look submitted.
- Preview chips (word + score + ✓/✗) readable, and never occlude the pending word
  or the rack; total badge anchored to the main word.
- Blank tiles visually distinct (no point index) after designation.
- Rack tiles and all interactive targets ≥ 44×44 px on the phone viewport.
- Exchange-mode selection state obvious; confirm bar states the cost.
- Pass-device interstitial fully hides both racks (no tile leakage in the frame).
- Player bars, rack, preview chips, and board never overlap; safe-area respected
  at 390×844.
- Last-play highlight visible but subordinate to pending-placement emphasis.
- Result overlay hierarchy: outcome → reason → score story (with adjustment line
  items) → actions; readable over any board.
- Text contrast ≥ 4.5:1 (spot-check theme tokens, all tile skins).
- No layout shift between `?static=1` captures of the same entry (determinism).

## Landing (T4.2)

- Hero vignette: real board cells (premium colors + labels) with L-E-X tiles
  and their point indexes legible at every viewport; float animation frozen
  under `?static=1` / reduced motion.
- Hot-seat build shows Play hot-seat + Your games; full mode shows Google
  sign-in; the test sign-in form appears **only** against emulators.

## Accepted deviations

- 2026-07-04 — Phone rack slots render ~41px (guideline says ≥44): a 7-slot
  rack + shuffle/bag column at 390px can't give every slot 44px; slots cap at
  44px when space allows. Revisit in T6.1 if the tray layout changes.
- 2026-07-04 — Actions row wraps Resign onto a second line at 390×844.
  Functional and readable; spacing polish belongs to T6.2.
- 2026-07-04 — Negative-score draw headline shows a hyphen-minus ("Draw — -7
  apiece", scoreless fixture only). Typographic minus with T6.2 copy pass.
