# REQUIREMENTS — Bricks

A minimalist single-player brick-breaker: free offline web PWA, $1 native.

## Functional

- FR-1: One game mode — clear the wall, keep the ball alive, chase a high
  score. Levels continue until the last ball is lost.
- FR-2: The ball serves from the paddle (tap / Space); serve direction is
  seeded, never vertical.
- FR-3: The paddle follows drag/pointer (bounded speed) or the arrow keys;
  the bounce angle depends on where the ball lands on the paddle.
- FR-4: Bricks take one hit; from level 3 the top rows take two. Levels get
  denser and the ball faster (capped) as they go.
- FR-5: Three balls per game. Losing the last one ends the game.
- FR-6: Score: 10 points per brick hit; the HUD shows score, level, best,
  and balls left.
- FR-7: Best runs (top 5) and games-played persist locally, account-free
  (`@parlor/arcade` HighScoreStore over injected storage). A new best is
  celebrated in the game-over dialog.
- FR-8: The game pauses when the tab/app is backgrounded and never
  auto-resumes; pausing is also a button, resuming is the player's tap.
- FR-9: Light/dark mode, persisted, defaulting to the OS.
- FR-10: Home shows the pitch, Play, best runs, and the family panel
  (`MoreFromUs`).
- FR-11: Native ($1 wrap): serve haptic, success haptic on level clear and
  game over, share from the game-over dialog, review ask from the third
  finished game — all invisible on the web.

## Non-functional

- NFR-1: Zero backend: no firebase in the bundle (machine-checked), no
  accounts, no analytics, no network calls. Fully offline PWA.
- NFR-2: Deterministic engine: pure fixed-tick fold at 120 t/s; same seed +
  same input trace → identical end state (200-run property gate).
- NFR-3: Rendering never blocks simulation correctness: state advances only
  in the fixed update tick; the canvas draws whatever state exists.
- NFR-4: The court letterboxes into any viewport (phone-first, DPR-crisp).
- NFR-5: Storage failures never interrupt play.
- NFR-6: Lighthouse-PWA-clean, offline cold start on /play.

## Out of scope (v1)

Power-ups, multiball, brick variety beyond hp-2, level editors, online
leaderboards (no backend, ever), sound, multiplayer of any kind.
