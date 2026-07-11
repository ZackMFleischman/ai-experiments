# IMPLEMENTATION — Tafl

Status ledger. Design rationale in `DESIGN.md`; the phased brand plan in
repo-root `BRAND-IMPLEMENTATION.md` (Phase 4b — this app is the second
manual pass of `GAME-SETUP.md`, and its friction log §3 is the
create-app generator's requirements doc).

## §0 Build protocol

Tests first where behavior is specifiable; `pnpm typecheck && pnpm test`
always-on; docs amended in the same PR; never weaken a gate. Engine rule
changes update DESIGN §2 in the same PR.

## §1 Gates (every PR)

`pnpm typecheck` (docs + boundaries + rules-parity + all packages) ·
`pnpm test` (engine 50 / app 7 / functions 19 under live emulators — Java
21) · `pnpm build` (static PWA + no-firebase bundle check) ·
`pnpm validate:m1` (200-game property sweep) · `pnpm validate:m0` (adds
the hot-seat Playwright smoke) · `pnpm validate:visual` (36 captures —
review them).

## §2 Milestones

### M0 — the whole game — SHIPPED (this PR)

Engine + app + functions in one slice, per GAME-SETUP.md §§1–10: tafl
kernel; hot-seat + online over one LogSession fold; parlor callable shells
(no draws — repetition is engine-derived); log-replay transport with
snapshot regression check; lobby/landing/join over lobby-ui slots; brand
shell (first duo adopter); rules/indexes verbatim + parity; emulator seed
+ 19 emulator tests; hot-seat smoke + visual gallery; `tafl-{ci,deploy}`.
⚑ owner remainder (GAME-SETUP.md §11): register `tafl-zmf`, paste the
`VITE_FIREBASE_*` config + VAPID key into `packages/app/.env`, deploy SA +
`FIREBASE_SERVICE_ACCOUNT_TAFL_ZMF` secret, budget alerts, first OAuth
sign-in + real-device push check.

### M1 — polish from real play — open

Candidates: move-list drawer, capture animations, `MoreFromUs` panel once
web-public, two-browser multiplayer e2e (lex's harness), native track
(GAME-SETUP.md §12) once the duo store posture is decided.

## §3 Friction log (feeds tools/create-app — Phase 4c)

What the second manual pass showed the generator must stamp or fix:

1. Verbatim-copy set is large and mechanical: rules/indexes, parity/
   boundaries/docs/bundle scripts, firebase.json/.firebaserc, emulator
   seed, e2e configs, sw.ts, workflows — all pure templating (game name +
   ports + accent). The only real thinking is engine + config + screens.
2. lex's check-bundle embeds dictionary checks — game-specific bits hide
   in "shared" scripts; the generator needs clean archetype templates, not
   sed over the nearest sibling.
3. Seats-are-sides (DESIGN §3) removes a whole mapping layer; the duo
   template should default to engine-named seat keys.
4. The Firestore REST PATCH in test helpers replaces whole docs — rigging
   positions needs the updateMask variant (now in tafl's helpers; lift it).
5. Ports collide across sibling e2e suites — the generator should assign
   per-app dev/e2e ports (tafl took 5202/5203).
6. `@parlor/brand` + lobby-ui compose cleanly for a duo app: theme +
   AppShell + Landing/Join/Lobby slots ≈ zero bespoke chrome. The
   hive/lex retrofit question can now be judged on evidence.

## §7 Docs policy

Closed, line-budgeted doc set enforced by `scripts/check-docs.mjs` (wired
into `pnpm typecheck`): README 25 · CLAUDE 55 · REQUIREMENTS 250 · DESIGN
500 · IMPLEMENTATION 400 · DECISIONS uncapped (append-only). Shipped
milestone detail collapses to a one-liner here; the record lives in
`DECISIONS.md`. Amend in place — no "Update:" markers.
