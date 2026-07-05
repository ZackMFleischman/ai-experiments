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
- A dragged tile is always visible: a fixed-position shadowed ghost rides
  above the finger everywhere (it survives leaving the viewport), the source
  slot/cell renders empty, and drops hit-test at the GHOST's center — the
  hover highlight always matches where the tile will land.
- Rack ergonomics (real-device round): tray padded past the iOS home
  indicator (safe-area, bag chip never clipped); a press anywhere on the tray
  grabs the nearest tile; neighbors slide over in real time during reorder.
  ANY drag hovering the tray — rack- or board-origin — flips to insertion
  mode: ghost drops to the finger, slots preview the splice, release commits
  it (staged tiles return to the exact slot you point at).
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

## Lobby / New game / Join / Waiting (T4.7)

- Header fits ONE line at 390px: title + truncating identity chip + gear
  (sign-out lives in Settings → Account). New-game FAB is labeled, not a bare
  +; the empty state carries the primary "Start a new game" CTA.

- Lobby groups labeled and ordered (challenges, your turn, waiting, finished);
  cards carry thumbnail, scores + last play (2-line clamp — never truncated to
  scores alone), your-turn/deadline/result chips distinguishable in both themes.
- New game: both board cards show real premium-map previews; dictionaries show
  name + word count + description; toggles legible at 390px.
- Join card lists board, dictionary + word count, time control, and seat
  (FR-10) before the accept button; themed hero above.
- Waiting screen: invite link AND bare code visible with copy affordances;
  challenge variant swaps copy + withdraw action; board never visible while open.

## Notifications (T5.2)

- iOS coach mark: share-icon + copy legible both themes; dismiss target ≥ 44px.
- Enable-notifications banner appears only in full mode with permission
  undecided (unit-gated; not in the static gallery).

## Polish (T6.2)

- Rejected-move toast (notice-toast entry): filled error alert, top-center,
  legible over the board in both themes; dismiss target present.
- Lobby empty state: tile motif + headline + invite copy centered; tiles render
  in the active skin/theme.
- Negative scores everywhere (score bar, result overlay) use the typographic
  minus (−), never hyphen-minus.
- Action row (Play/Recall/Exchange/Pass/Resign) fits one line at 390×844.

## Tile skins & Settings (T6.1)

- Settings: theme toggle and skin samples reflect the *rendered* theme (mode is
  read from the MUI theme, never a parallel context); active skin card outlined;
  each sample renders its own skin's vars live.
- Walnut: premium squares + labels legible on wood in both themes; cream tiles
  clearly separate from cell background.
- High contrast: hard-outlined tiles on a black/white grid (inverted in dark);
  dark tiles are black-on-yellow; DL/TL/DW/TW labels stay the non-color signal.

## Accepted deviations

(none — the ~41px rack-slot deviation closed when the tray shed its side
column reserve: slots now hit ~45px at 390px and cap at 52px.)
