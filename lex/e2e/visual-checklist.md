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
  or the rack; no other score floater competes with them.
- Blank tiles visually distinct (no point index) after designation.
- Rack tiles and all interactive targets ≥ 44×44 px on the phone viewport.
- Exchange-mode selection state obvious; confirm bar states the cost.
- Pass-device interstitial fully hides both racks (no tile leakage in the frame).
- Player bars, rack, preview chips, and board never overlap; safe-area respected
  at 390×844.
- Player bar: names show as first names (long full names shortened, never
  wrapping to a second line so the big score number sits centered, not
  top-justified); the side-to-move seat carries a clock-icon move-clock when
  the game has a time control, on that seat only.
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
  The deadline (clock-icon) chip rides BOTH your-turn and waiting cards — the
  current player's move deadline — and never starves the caption at 390px.
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
- Action row fits one line at 390×844: Recall/Exchange/Pass are a compact
  icon-button cluster (≥44px targets) on the left; Play is the prominent
  contained CTA pinned to the right ("thumb corner"), clearly separated by a
  spacer so it never sits adjacent to a secondary action; Resign is only in the
  ⋯ overflow menu (never in the CTA slot).

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

## Word definitions (T7.2)

- Definition sheet: the word reads as the heading (uppercase, letter-spaced);
  part of speech is spelled out ("noun", not "n"); the gloss is body text, not
  a caption.
- A gloss found through a reduced form carries the "form of CAT" chip — the
  player can always see which word was actually defined.
- The `definition-none` state reads as informative, not as a rejection: a legal
  word is stated to be legal (`definition-none`), while a word the dictionary
  rejected says so instead of being called legal (`definition-none-illegal`).
  The Wiktionary link-out is present in every state.
- Preview chips stay legible as buttons: no focus ring or button chrome at rest,
  and their grown tap targets (≥44px) don't overlap enough to make the wrong
  word tappable on a pileup.

## Accepted deviations

(none — the ~41px rack-slot deviation closed when the tray shed its side
column reserve: slots now hit ~45px at 390px and cap at 52px.)
