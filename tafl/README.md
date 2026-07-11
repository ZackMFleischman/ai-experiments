# Tafl (tafl/)

Hnefatafl — the Viking siege game, for two. The classic 11×11 board:
twenty-four attackers against a king and twelve defenders; the king runs
for a corner, the attackers close the net. Free hot-seat + online multiplayer on the
`@parlor/*` platform, and the **first duo title on `@parlor/brand`**.

- **Play**: hot-seat on one device (static PWA, zero backend) or online
  with a friend (invites, challenges, rematches, async move clocks, push).
- **Engine**: pure deterministic rules kernel (`@tafl/engine`, 50 tests).
- **Stack**: engine + app + functions over `@parlor/{core,web,server,brand}`,
  server-authoritative Firestore, dual deploy (Cloudflare hot-seat +
  Firebase multiplayer).

Status: built; ⚑ prod Firebase project + store ops pending (owner).

Start with `CLAUDE.md` (rules + commands); design in `DESIGN.md`.
