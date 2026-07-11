# Design principles — the brand's game UI

The house design language for every `@parlor/brand` app (sudoku, stillness,
breakout, tafl, checkers, and everything `tools/create-app` stamps next).
Like `GAME-SETUP.md`, this lives at the repo root because it is
cross-cutting; the enforcement lives in code — `@parlor/brand` components
*are* these rules, so the default path is the compliant path. Apps deviate
only with a `DECISIONS.md` entry explaining why.

The one-line test for any screen: **would a stranger know in two seconds
what the game is, whose turn it is, and what to tap?**

## 1. The game is the screen

- On a play surface, the board/court/ring owns the real estate. Chrome is
  one dense bar (`AppShell` — back, small wordmark, quiet actions), the HUD
  is one row (`GameHud`), controls are one quiet row below the play area.
  Nothing else. Play screens never scroll (`100dvh`, `fullBleed`).
- Leftover vertical space centers the play area between HUD and controls —
  never a board pinned high over a void (the checkers v1 mistake).
- **No marketing on a play surface.** Cross-promo, ratings, share prompts
  live on Home or in end-of-game dialogs only.

## 2. One header, coherent by player count

Every play screen uses `GameHud` from `@parlor/brand`, directly under the
chrome bar. Its shape follows the player count:

- **Two players** (`seats` given): two seat plaques — glyph + name — with
  the **active seat carrying the accent** (tint + border + weight); status
  and move metadata sit between them. Turn state must be legible from the
  plaques alone, without reading the status text.
- **One player** (no `seats`): status (score / puzzle kind / progress) on
  the left, quiet metadata (time / level / lives) on the right.
- The status text is the single line of truth (`data-testid="status-line"`
  — tests and e2e key off it). The chrome title is the app's name, not
  game state: state changes, wordmarks don't.

## 3. One accent, a whole palette

- Each app declares exactly one accent (`ACCENT` in `App.tsx`);
  `createBrandTheme` derives everything else — tinted backgrounds, board
  surface tokens (`theme.palette.board`), selection washes. **Never
  hardcode a surface hex in an app**; if a color isn't derivable from the
  theme, the theme is missing a token — add it to `@parlor/brand`.
- The accent must be visible on the play surface (active seat, selection,
  last-move wash, progress ring) — an app should be identifiable from a
  screenshot with the title cropped off.
- Both color modes ship first-class; `validate:visual` captures both.

## 4. Cross-promo is a whisper

- `MoreFromUs` is a footer: below a divider, pushed to the bottom, small
  text links. It never renders as cards, never above app content, never on
  a play surface, and never grows past one quiet block. The game earns the
  screen; the family earns a footnote.

## 5. Quiet, consistent voice

- Sentence case everywhere; buttons say what they do ("Play hot-seat",
  "Resign"). Destructive actions confirm in a dialog and name the outcome.
- Metadata (move counts, streaks, bests) renders `text.secondary`, small,
  and unlabelled where the meaning is obvious.
- Dialogs are for terminal moments (game over, resign, solved) — not for
  status that belongs in the HUD.

## Enforcement map

| Rule | Where it's encoded |
| --- | --- |
| chrome + real estate | `@parlor/brand` `AppShell` (dense bar, flex column, safe areas) |
| header by player count | `@parlor/brand` `GameHud` (seats ⇒ duo plaques; none ⇒ solo row) |
| palette from one accent | `createBrandTheme` (derived backgrounds + `palette.board` tokens) |
| cross-promo demotion | `MoreFromUs` (renders only as the quiet footer) |
| screenshot proof | each app's `validate:visual` gallery — read the captures |

New apps inherit all of this by stamping from the exemplars
(`tools/create-app`); the PLAYBOOK's morph step keeps `GameHud`/`AppShell`
in place and swaps only the game-specific core.
