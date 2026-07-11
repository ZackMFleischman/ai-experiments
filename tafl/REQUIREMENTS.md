# REQUIREMENTS — Tafl

A two-player hnefatafl PWA: free hot-seat, online multiplayer with a
friend, on the shared parlor platform.

## Functional

- FR-1: Hnefatafl rules (11×11): rook moves; only the king lands on the throne
  or corners; custodian capture with corners (and the empty throne) as
  hostile anvils; the armed king is captured like any piece.
- FR-2: Wins — king to a corner (defenders), king captured (attackers), no
  legal moves (mover wins); threefold repetition is a draw.
- FR-3: Hot-seat on one device: unguarded `/game/local`, persisted across
  refresh, playable fully offline (static PWA).
- FR-4: Online games: create with a side choice (attackers / defenders /
  random) + optional move clock (1/3/7 days), share an invite link/code, or
  challenge a past opponent directly.
- FR-5: Server-authoritative play: every mutation is a callable; clients
  never write game docs. Stale/turn/legality violations are rejected.
- FR-6: Lobby: grouped live game list with board thumbnails, turn badge,
  incoming challenges, join-by-code.
- FR-7: Resign (with confirm), rematch (sides swap, both players converge
  on the same next game), forfeit sweep on expired clocks.
- FR-8: Web push nudges (your move, game over, challenges, deadline
  warnings) with the icon badge kept in step with the lobby.
- FR-9: Board interaction: tap a piece to see its legal destinations, tap
  to move; last move highlighted; full keyboard/screen-reader labels.
- FR-10: Brand shell: `@parlor/brand` theme + AppShell (tafl teal accent),
  light/dark, persisted.

## Non-functional

- NFR-1: The move log is the source of truth; the doc snapshot is a
  denormalization (regression-checked on load).
- NFR-2: The engine is pure/deterministic; the same log always folds to
  the same state (50-test suite incl. a seeded random-game property).
- NFR-3: The default bundle is firebase-free (machine-checked); the
  multiplayer stack loads only in full mode.
- NFR-4: Offline cold start on the hot-seat route; installable PWA.
- NFR-5: Security rules track parlor's canonical base (parity-linted);
  negative-path rules tests are the gate.

## Out of scope (v1)

Other tafl variants (Copenhagen shieldwall, Tablut 9×9), AI opponent,
spectators, chat, native store wrap (decide after the archetype's store
posture is proven — see DECISIONS).
