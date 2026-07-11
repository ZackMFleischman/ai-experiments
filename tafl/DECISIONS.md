# DECISIONS — Tafl

> Append-only. New entries at the bottom: date, decision, one-line why.
> ≤8 lines each. Milestone SHIPPED entries follow the same format (date,
> gates run, deviations, stumbles). Post-v1 ideas go here as one-liners
> tagged `post-v1`.

---

- **2026-07-11 — variant is Brandub (7×7), one ruleset.** Smallest
  well-attested tafl: 13 pieces, armed king captured two-sided, corner
  escape. Copenhagen (shieldwalls, edge forts) and Tablut are `post-v1`
  variants behind the same engine surface if ever wanted.

- **2026-07-11 — seats ARE sides.** `seatKeys = ['attackers','defenders']`
  and engine `toMove` share the strings, so parlor's defaults (toMove
  seeding, seat-keyed results, forfeit sweep, isMyTurn) work with zero
  mapping. Hive/lex carry a color/index layer; tafl proves it unnecessary.

- **2026-07-11 — repetition: initial position counts.** `initialTafl()`
  seeds the `seen` ledger, so the third sighting of any position
  (including the opening) draws — chess-style, no special cases.

- **2026-07-11 — no draw callables.** Brandub's only draw is
  engine-derived (repetition); offer/accept would be dead UI. Same
  omission pattern as lex.

- **2026-07-11 — first duo title on @parlor/brand** (the Phase 4b
  question). Brand theme + AppShell + lobby-ui slots covered all chrome;
  no bespoke theme.ts. Evidence for the hive/lex retrofit call: cheap,
  but only worth batching with other work in those apps.

- **2026-07-11 — native wrap deferred** (`post-v1`). GAME-SETUP §12 is
  proven on sudoku/stillness; a duo game's $1 posture (online play needs
  auth + a live backend) deserves its own decision after tafl is public.

- **2026-07-11 — M0 SHIPPED** (PR #88, Phase 4b slice). Gates: typecheck
  (docs/boundaries/rules-parity) / engine 50 + app 7 + functions 19
  (live emulators) / build + bundle check / validate:m1 (200 games) /
  hot-seat smoke / visual (36 captures) — all green locally and in CI.
  Deviations: one branch for all Phase 4+5 slices; engine built by a
  parallel agent to spec. Stumbles: REST PATCH needs updateMask to rig
  positions; lex's check-bundle carried dictionary checks into the port;
  MUI dialogs aria-hide background buttons in tests.

- **2026-07-11 — house design language adopted.** Repo-root
  `DESIGN-PRINCIPLES.md` now governs UI, encoded in `@parlor/brand`
  (GameHud play header coherent by player count, accent-derived
  palette + board tokens, MoreFromUs demoted to a footer). GameScreen now renders the shared `GameHud` (seat plaques, active side carries the accent) with the board centered in the leftover space; Board/MiniBoard read `theme.palette.board` tokens.

- **2026-07-11 — variant is now 11×11 hnefatafl (supersedes the Brandub
  decision above).** Zack wants the classic set: 24 attackers in four edge
  camps vs 12 defenders + king, throne at 60, corners the escape squares.
  Rules kernel unchanged (armed king, two-sided capture, corner escape) —
  only geometry and the opening position moved. The 200-game property
  sweep budget now scales with board cost. Copenhagen extras stay post-v1.

- **2026-07-11 — phone-first art pass, inside the house language.** The
  11×11 board runs edge to edge (`min(100%, calc(100dvh - 230px))` keeps
  play screens scroll-free per §1); surfaces and grid hairlines read
  `theme.palette.board` (§3); the shared `GameHud` carries the seat
  plaques with the board's own piece glyphs. One §3 deviation: piece
  ink/bone hexes stay fixed across color modes so attackers always read
  dark and defenders pale — side identity beats mode inversion.
