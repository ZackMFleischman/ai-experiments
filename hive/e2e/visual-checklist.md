# Visual review checklist

Reviewed against `artifacts/screens/` after every [visual] task (`pnpm
validate:visual`, IMPLEMENTATION §0.2.5). Fixed findings are deleted; only
currently-accepted deviations stay listed at the bottom.

## Global (every capture)

- [ ] Bug glyphs distinguishable from each other at 40 px; readable at minimum zoom.
- [ ] White/black tiles and their glyphs legible in **both** themes; ghost targets
      clearly visible on the board background in both themes.
- [ ] Dimmed (non-target) content still readable; dim ≈ 20%, not 80%.
- [ ] Stack offsets convey height; fanned stack doesn't overlap player bars.
- [ ] All interactive targets ≥ 44×44 px on the phone viewport.
- [ ] Player bars, tray, and board never overlap; safe-area respected at 390×844.
- [ ] Last-move highlight visible but subordinate to selection highlights.
- [ ] Victory overlay: clear hierarchy (outcome → reason → stats → actions);
      readable over any board.
- [ ] Text contrast ≥ 4.5:1 (spot-check the MUI theme tokens).
- [ ] No layout shift between `?static=1` captures of the same entry (determinism).

## Per-screen

- Board entries: auto-fit keeps the whole hive visible with breathing room;
  the recenter button never covers a tile.
- Interaction entries: exactly one selected piece; ghosts only on legal cells;
  drag preview snaps to the hovered target; not-allowed tint is unmistakable.
- Tray: counts legible; depleted bugs read as depleted; queen pulse only when
  queen-by-4 is binding.
- End-of-game: pulse ring on all six surrounding tiles; banner never shows
  during the beat; overlay actions all reachable on phone.

## Review log

- 2026-07-03 (T3.10, first full pass, 120 captures + ux frames read): glyphs
  distinguishable at 40px both themes; ghosts/climb badges visible on light and
  dark; dim keeps content readable; drag preview snaps and the not-allowed
  cross is unmistakable; overlay hierarchy clean at 390×844; tray targets 52px;
  no board overflow at any viewport. Finding fixed during the pass: black-tile
  edges brightened for dark backgrounds; result banner no longer shows during
  the end-of-game beat. Minor (queued for T6): tray count badges are low-ish
  contrast in dark theme.

## Accepted deviations

- Draft glyph geometry (circle/arc primitives) until the T6.1 art pass.
- Board tiles draw as inline polygons (exact grid geometry); the sprite sheet's
  `hex-base` symbol is used everywhere outside the board grid. One visual
  language, two code paths — revisit in T6.1.
- Stacks paint per-cell, so a tall stack's upper tiles can be overdrawn by the
  neighbor in front — z-order polish queued for T6.2 (per Zack, 2026-07-02).
