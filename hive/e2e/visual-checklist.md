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

- 2026-07-03 (T4.2, 24 new captures read: landing-signin/landing-hotseat/
  join-ready/join-invalid × 3 viewports × 2 themes): hero cluster legible in
  both themes incl. the beetle stack; wordmark/tagline/CTA hierarchy clean;
  join card states readable over the dark background; accept/sign-in buttons
  ≥44px on phone; no overflow at any viewport. No new findings.

- 2026-07-03 (T4.7, 24 new captures read: lobby-populated/lobby-empty/
  new-game-form/new-game-invite-link × 3 viewports × 2 themes): group headers
  and chips (Your turn / Invited / Won / Lost) legible both themes; thumbnails
  render real positions; toggles and CTA ≥44px; invite URL + copy affordance
  clear. Minor accepted: long "Waiting for opponent…" truncates with ellipsis
  on phone cards.

- 2026-07-03 (T5.2, 6 new captures read: lobby-coach-mark × 3 viewports × 2
  themes): share icon + headline + install instructions legible both themes;
  dismiss target comfortable; card border reads as callout, not error.

- 2026-07-03 (T6.1 art pass, sprite contact sheet re-read at 80px + 40px, both
  themes): all eight species distinguishable at 40px — striped queen w/ crown,
  jointed-leg ant, eight-legged spider, leaping grasshopper, split-elytra
  beetle, proboscis mosquito, spotted ladybug, segmented pillbug; strokes stay
  inside the hex at 80px; PWA icons regenerate cleanly from the new queen.

- 2026-07-03 (T6.2, tall-stack + interaction captures re-read after the board
  z-order rewrite): stacks now paint by vertical layer — top tiles never
  overdrawn by the neighbor in front; selection ring, ghosts and dim behave
  identically after the DOM restructure; ux drag/tap flows green.

- 2026-07-03 (T6.3 full re-review pass, sampled across all 29 entries × 3
  viewports × 2 themes after the T6.1/T6.2 changes): finding fixed — dark-theme
  tray count badges were near-invisible (background.paper on dark tray), now
  primary-tinted with contrast text, re-captured and verified. Overlay
  hierarchy, dark-board legibility, lobby chips/thumbnails, and interaction
  affordances all clean at phone/tablet/desktop in both themes.

- 2026-07-03 (landing hero fix, reported by Zack: "title screen hexes aren't
  lined up"): the sprite sheet was mounted per-screen (game, gallery) so the
  real `/` route rendered the hero with no glyphs — the stacked beetle's lift
  offset read as a mis-snapped hex. Sheet now injected once at the app root;
  hero re-read at phone/desktop, both themes: all 8 glyphs render, stack reads
  as a climb. Gallery captures had masked this (the gallery mounts its own
  providers), hence the smoke-test regression guard on the live route.

## Accepted deviations

- Board tiles draw as inline polygons (exact grid geometry); the sprite sheet's
  `hex-base` symbol is used everywhere outside the board grid. One visual
  language, two code paths — revisit in T6.1.
