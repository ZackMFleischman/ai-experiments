# Visual review checklist — lex/

Reviewed against every `validate:visual` / `validate:ux` capture (IMPLEMENTATION
§0.2.5). Per-screen sections grow as screens land; global items first. Accepted
deviations are logged at the bottom with date + reason, deleted when fixed.

## Global

- Tile letters and point indexes legible at placement zoom on phone; at fit-view
  the board reads as orientation (word shapes visible), not mush.
- Premium squares distinguishable in light **and** dark across tile skins, with
  DL/TL/DW/TW labels so color is never the only signal.
- **Pending vs committed tiles** unmistakable in both themes (lift + gold edge);
  pending tiles never look submitted.
- Preview card (one row per word + score + ✓/✗, bingo line, total) readable at
  every zoom, never occluding the pending word or the rack, fully on screen
  including the eight-row bingo case. Click-through apart from its grip (a tap
  lands on the cell beneath); the geometry hint has no grip; its parked position
  survives a pan/zoom.
- A word that failed the dictionary reads as a blocked play from across the
  board in both themes: red card border, struck-through total, that row filled
  red, cells ringed dashed red — and the valid card beside it stays calm. The
  card says it in color, never in a sentence.
- **A "Cost your turn" game gives NOTHING away** (`pending-words-unchecked`,
  staging a word the dictionary refuses): no ✓, no ✗, nothing standing in for a
  mark, no red on card or board, total not struck through, Play plainly enabled
  — each row just the word and its score. The capture must be indistinguishable
  from the same staging with a valid word except for the missing mark; if a
  reviewer can tell which word is bad, the feature is broken.
- **Phoney beat** (`phoney-beat`): the refused word dominates the dialog, the
  cost is a sentence, the board behind is unchanged, no mode name appears. Both
  themes at 390×844. In hot-seat it sits ON TOP of the pass-device interstitial
  — no rack readable in the frame, before or after dismissal.
- **The aftermath names who, what and the cost** (`phoney-banner`,
  `score-sheet-phoney`): the strip reads "<name> tried to play the invalid word
  “X” — turn lost" over a visibly untouched board, wrapping to at most two lines
  at 390px without crowding the score bar; the sheet row is MARKED as well as
  worded (✗, red, an explicit `0`), so a burned turn is findable by scanning.
- Last-play score badge sits in an EMPTY cell beside its word — including a word
  that bridged committed letters — never on top of a tile, and follows the
  word's axis (right of an across play, below a down play). Tapping it expands
  the per-word breakdown; the popover is readable in both themes and clears the
  board on dismiss. A tap on the board tucks the badge away (the green
  highlight stays put); another tap brings it back.
- The two creation forms (`new-game`, `hotseat-setup`) render the shared option
  pickers identically — same section rhythm, same board previews, same
  invalid-words toggle and blurb, and the same 2-4 player-count row. Hot-seat
  shows no turn-order or clock section (one device honours neither);
  differences beyond that mean the pickers have drifted apart.
- Blank tiles visually distinct (no point index) after designation.
- Rack tiles and all interactive targets ≥ 44×44 px on the phone viewport.
- Exchange-mode selection state obvious; confirm bar states the cost.
- Pass-device interstitial fully hides both racks (no tile leakage in the frame).
- Player bars, rack, preview card, and board never overlap; safe-area respected
  at 390×844.
- Player bar: names show as first names (long full names shortened, never
  wrapping to a second line so the big score number sits centered, not
  top-justified); the side-to-move seat carries a clock-icon move-clock when
  the game has a time control, on that seat only.
- Player bar at N seats (T7.13): the turn line reads from the local seat ("Your
  turn" / "{Name}'s turn"), and the standings rail runs in TURN order — seat to
  move first, each row numbered 1..n. One row at ≥900px, turn line above rail
  below 900px; four seats fit 390px with no horizontal scroll and no wrapped
  rows (names ellipsize instead).
- Withdrawn seat in the rail: muted, no numeral, "out", score readable; others
  renumber gapless. At game over the rail reads by PLACING, no turn highlight.
- Catch-up bar at 3+ seats (T7.14): one line under the player bar naming the
  reviewed move ("Kai played TOE +4") with ‹ › and Live ≥44px; stepping back
  rewinds the board (later tiles gone) and moves the SAME green highlight onto
  the reviewed play; the rack and action row stay live behind it.
- Columnar score sheet: a column per player, a row per round, running totals
  footing each column; four seats readable at 390px (the sheet scrolls sideways
  inside its own box, the page never does).
- Last-play highlight (green edge) clearly a different signal than pending gold,
  and gone entirely while any tile is staged.
- A dragged tile is always visible: a fixed-position shadowed ghost rides
  under the finger (it survives leaving the viewport) and SNAPS into the free
  cell it would land in — position and scale match the cell exactly; the
  source slot/cell renders empty; release commits the snapped cell (nothing
  snapped = the tile goes home) so a drop never lands anywhere the snap
  didn't show.
- Rack ergonomics (real-device round): tray padded past the iOS home
  indicator (safe-area, bag chip never clipped); a press anywhere on the tray
  grabs the nearest tile; neighbors slide over in real time during reorder.
  ANY drag hovering the tray — rack- or board-origin — flips to insertion
  mode: the ghost un-snaps to ride the finger, slots preview the splice,
  release commits it (staged tiles return to the exact slot you point at).
- Result overlay: outcome → reason → podium (placing, name, final, adjustment
  line item; winner first at any count; withdrawn rows out, last, and say why)
  → stats → actions; at 3+ Rematch names who it invites and offers the opt-out.
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
  cards carry thumbnail, scores/placings + last play (two lines at 3+, clamped,
  never truncated to scores alone), your-turn/deadline/result chips clear in
  both themes; at 3+ the title names the table. The deadline (clock-icon) chip
  rides your-turn AND waiting cards and never starves the caption at 390px.
- New game: both board cards show real premium-map previews; dictionaries show
  name + word count + description, toggles legible at 390px. PLAYERS offers only
  the selected board's range; a board that cannot seat the count is dimmed and
  disabled with its range, never hidden; the invite row is multi-select at 3+;
  the pace line under the clock states the round at the chosen count.
- Join card lists board, dictionary + word count, time control and seat (FR-10)
  before the accept button, themed hero above; a "costs your turn" game says so
  on a warning chip. A 3+ code previews the guest list and the places left
  instead of a seat; a full room reads "This game is full", never "no longer
  valid". Waiting screen: invite link AND bare code with copy affordances; the
  challenge variant swaps copy + withdraw action; the board is never visible
  while the game is open.

## Notifications (T5.2)

- iOS coach mark: share-icon + copy legible both themes; dismiss target ≥ 44px.
- Enable-notifications banner only in full mode with permission undecided
  (unit-gated; not in the static gallery).

## Polish (T6.2)

- Rejected-move toast (notice-toast entry): filled error alert, top-center,
  legible over the board in both themes; dismiss target present.
- Lobby empty state: tile motif + headline + invite copy centered, tiles in the
  active skin/theme. Negative scores (score bar, result overlay) use the
  typographic minus (−), never hyphen-minus.
- Action row fits one line at 390×844: Recall/Exchange/Pass a compact
  icon-button cluster (≥44px targets) on the left; Play the contained CTA pinned
  right ("thumb corner"), spacer-separated so it never abuts a secondary action;
  Resign only in the ⋯ overflow, never in the CTA slot — labelled Withdraw at 3+
  seats, its confirm saying the player leaves and the others play on.

## Tile skins & Settings (T6.1)

- Settings: theme toggle and skin samples reflect the *rendered* theme (mode is
  read from the MUI theme, never a parallel context); active skin card outlined;
  each sample renders its own skin's vars live.
- Settings → Gameplay: "Play instantly / Confirm before playing" toggle;
  when on, tapping Play opens a confirm dialog ("Play your move?") before
  committing the turn.
- Walnut: premium squares + labels legible on wood in both themes; cream tiles
  clearly separate from cell background.
- High contrast: hard-outlined tiles on a black/white grid (inverted in dark);
  dark tiles are black-on-yellow; DL/TL/DW/TW labels stay the non-color signal.

## Accepted deviations

- **2026-08-05 — the preview card's drag grip is 26×28, not 44×44.** Every pixel
  of the grip is a board cell the player cannot tap (the rest of the card is
  click-through so taps reach the board), so the usual target size would trade
  the bug just fixed for a smaller one. A missed grab falls through to the
  board. Revisit if real-device use shows grabs failing.
