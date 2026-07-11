# Bricks (breakout/)

A minimalist brick-breaker — the first `@parlor/arcade` title. Free on the
web, $1 in the app stores, zero backend forever.

- **Play**: one paddle, one ball, a wall that gets a little harder every
  level. Drag or arrow keys; tap to serve. Best runs stay on your device.
- **Engine**: pure deterministic fixed-tick fold (`@breakout/engine`) — same
  seed + same input trace is the same game, forever.
- **Stack**: React + MUI over `@parlor/arcade` (loop/input/canvas/scores),
  `@parlor/brand` (family shell + theme), `@parlor/native` ($1 Capacitor
  wrap). Static PWA on Cloudflare Pages; no Firebase, machine-checked.

Status: built; store submission pending (⚑ owner store ops).

Start with `CLAUDE.md` (rules + commands); design in `DESIGN.md`.
