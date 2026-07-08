# Parlor platform hardening — implementation plan

Forward-looking plan for closing the gaps in `@parlor/*` so a new turn-based
two-player game (e.g. checkers) reuses the platform instead of copy-adapting
hive. Scope is **2-player** (N-player is a separate breaking epic, parked).

> Placement note: this lives at the repo root because `parlor/` keeps a closed,
> line-budgeted doc set (`CLAUDE.md` + `README.md` only — `parlor/scripts/check-docs.mjs`).
> Moving it under `parlor/` (or `lex/`) requires a consumer `DECISIONS.md` entry
> to expand that set.

## Principles (why this is low-risk)

- **Refactors, not rewrites.** The behavior already exists and is correct in hive
  + lex. The oracle is free: their emulator callable tests, integration tests, and
  two-browser e2e already pin the exact behavior. Extract → have both games consume
  → run their gates. Green = equivalence-proven. No new test burden.
- **Additive / opt-in.** Everything here is a new `@parlor/*` export; nothing forces
  a breaking change (no touching `LobbySummary`). Per parlor's rule, every PR still
  keeps hive **and** lex green in lockstep and updates `lex/DESIGN.md §4`.
- **One PR per primitive** = land the parlor primitive + migrate both consumers +
  update the design map, staying green throughout.

---

## Phase 1 — Rules + indexes template *(low risk, high leverage, no code)* — ✅ SHIPPED 2026-07-08

> Shipped: `parlor/firestore.rules` + `parlor/firestore.indexes.json` are the
> canonical reference (rack/bag override documented inline). Firebase rejects a
> cross-project `../parlor/...` rules path in `firebase.json` ("outside of project
> directory"), so each game keeps its own in-project copy and a new
> `scripts/check-rules-parity.mjs` (wired into `pnpm typecheck`) enforces that the
> copy neither drifts from nor weakens the shared base — added tiers (lex's
> rack/bag) allowed, weakened base tiers rejected. The games' unchanged
> negative-path rules tests stay the behavioral gate; `lex/DESIGN.md §4` + both
> `DECISIONS.md` updated. (First attempt re-pointed `firebase.json` across the
> workspace — CI caught firebase's in-project-only constraint; pivoted to the
> plan's "diff against the template" branch.)

**Goal:** stop copy-pasting the security model. hive's and lex's `firestore.rules`
+ composite indexes are near-identical (three-tier: own `users/{uid}`, `games` by
`playerIds`, `invites` by code, deny-all else; the `playerIds + status + updatedAt`
lobby index).

**Ship:** a canonical `firestore.rules` + `firestore.indexes.json` reference in
parlor (declarative files, not TS), plus a note on the one override a hidden-info
game makes (lex denies `racks/*` reads to non-owners).

**Consumers:** hive + lex re-point / diff against the template; the negative-path
rules-unit-tests are the gate (security-sensitive — don't rush).

**Size:** ~0.5 day. **Risk:** low.

---

## Phase 2 — Move shell + the capability pattern *(server, medium)*

Two things ship together because they share the `pendingDrawOffer` seam.

### 2a. `createSubmitMove(config)` — the missing move-callable shell

The one primitive most conspicuously absent: parlor has create/join/rematch/resign
but not "make a move."

**Shared (identical in hive + lex today) → parlor:**
- `requireAuth` + parse the `{ gameId, expectedMoveCount, move }` envelope;
- transaction preconditions: doc exists, caller in `playerIds`, `status==='active'`,
  `moveCount === expectedMoveCount` (concurrency guard), `toMove === mySeat`;
- write `moves/{n}` + the game-doc `moveCount`/`deadlineAt`/`deadlineWarnedAt`
  bookkeeping + terminal fields; **always** `pendingDrawOffer: delete()` (a move
  voids a pending offer — a harmless no-op for games without draws, which is what
  lets 2a and 2b compose without knowing about each other);
- the fire-and-forget `notify` afterward.

**Injected (`config`):**
```ts
createSubmitMove({
  ...serverConfig,                     // reuse seatKeys + isMyTurn
  parseMove(raw): Move,
  advance(gameDoc, move, ctx): {       // the ONLY game-specific core
    moveDoc: Record<string, unknown>,  // { kind, uhp } | { kind, play } ...
    gameFields: Record<string, unknown>, // state|public, scores, lastPlay, toMove
    subWrites?: SubWrite[],            // lex: rack + private bag docs
    terminal?: { result, endedBy },
    push: { recipientUid, trigger, args },
  },
})
```

**Consumers:** hive's `submitMove` (~130 lines → a config), lex's (~290 → its
`advance` keeps exchange/rack/bag). Validated by `callables.test`/`meta.test` +
integration.

### 2b. `createDrawCallables(config)` — the first opt-in **capability**

Draws are useful for lots of games (chess, checkers, hive) but not all (lex draws
arise from tied scores). Model them as an opt-in capability, not a core feature.

**Why they extract almost for free:** draws touch only `seatKeys` + `notify` —
both already in `GameServerConfig`. Unlike the forfeit sweep (reads the engine
color `toMove`), draws care only about *which seat offered*, so `pendingDrawOffer`
keys by `seatKeys[i]` with zero engine/color coupling.

**Opt-in mechanism — a per-capability factory** (parlor already ships independent
factories: `createGameCallables`, `createForfeitHandlers`, `createNotify`):
```ts
export function createDrawCallables<O>(config: GameServerConfig<O>): {
  offerDraw: CallableFunction; respondDraw: CallableFunction;
}
```
Opt in = call it; opt out = don't. hive's `index.ts`:
```ts
export const { createGame, joinGame, ... } = createGameCallables(hiveConfig);
export const { offerDraw, respondDraw }   = createDrawCallables(hiveConfig); // ← opt-in
export { submitMove } from './games';
```
lex never calls it and ships no draw endpoints. No flags, no conditional return
types, no dead code. (A `createGameCallables(config, {draws:true})` flag would make
the return type vary by argument — avoid.)

**Three seams the capability owns:**
1. *A move clears the offer* — handled by 2a's unconditional `pendingDrawOffer:
   delete()`.
2. *The `draw-offered` push trigger* (not in `SharedTrigger`) — the contravariance
   pattern already in use: parlor exports `type DrawTrigger = 'draw-offered'`; the
   game types `buildPayload` as `(t: SharedTrigger | DrawTrigger, args) => …`, which
   is assignable to `NotifyConfig`'s narrower param. parlor ships a **default** draw
   payload so opting in doesn't force copy-writing.
3. *Client* — parlor exports `createDrawApi()` (the two typed `callable` stubs) and
   makes `pendingDrawOffer?: SeatKey` an **optional** `LobbySummary` field
   (optional = non-breaking for lex). The dialog stays game-styled; parlor may offer
   a headless `useDrawOffer(summary)` hook (logic, no pixels).

**Consumers:** hive's `offerDraw`/`respondDraw` (game-side today) → the capability;
`meta.test`'s draw suite + mp e2e prove equivalence. lex untouched.

**Size (2a+2b):** ~2 days. **Risk:** medium (Firestore transactions), fully covered
by the games' emulator tests.

### The generalized capability pattern

A **capability module** = a factory over the shared `GameServerConfig` that:
1. returns extra callables (server) + matching client stubs;
2. reuses `seatKeys` + `notify`, adds nothing to the core config;
3. declares its trigger strings, surfaced via the contravariant `buildPayload`
   union + a default payload;
4. declares any doc fields it owns + documents any shared-shell contract it needs
   (draws → "the move shell clears `pendingDrawOffer`");
5. optionally ships a headless client hook; UI stays game-side.

Self-contained, composed in `index.ts`, opt-in by inclusion. Draws is the reference
implementation; **takeback/undo requests, in-game chat, pause requests, pre-emptive
rematch** all fit the same mold.

---

## Phase 3 — `createFirestoreTransport(config)` + sync strategies *(client, medium-high)*

The second-biggest gap; the most design-sensitive because hive and lex diverge on
the *sync strategy*.

**Shared (near-identical in both) → parlor:**
- `constructor(gameId, uid)` + `players` cache;
- `open()` — fetch game doc, resolve `mySeat` from `players`, throw if not a player,
  return `{ options, mySeat, status, playerNames, inviteCode? }`;
- `watchMeta(cb)` — the game-doc slice listener **including the subtle
  delete-detection** (a deleted doc surfaces as `permission-denied`, not
  `exists:false`, because the read rule needs `playerIds`);
- `reset()` throw; the callable-routing skeleton of `submit()`.

**The fork — `load()` + `onRemoteEntry()` become a pluggable strategy:**
- **`logReplayStrategy`** (built in): each `moves/{n}` doc → an `Entry`; `load`
  returns the replayable log; `onRemoteEntry` emits each added move; includes the
  snapshot-vs-replay regression check. **Covers hive + any perfect-information game
  (checkers).**
- **`coherentAdoptionStrategy`** (lex's): re-fetch game+rack+moves per signal,
  coherence gates (rack `n`, log length), monotonic emit gate, serialized refetch
  with single-queue. Ship it (it's the only non-obvious part; lex proves it) behind
  the same interface, or leave it game-provided.

**Consumers:** hive → skeleton + `logReplayStrategy` (~193 → ~40 lines); lex →
skeleton + `coherentAdoptionStrategy`. Validated by integration + two-browser e2e.

**Size:** ~2–3 days (the strategy interface is the design work). **Risk:**
medium-high — live sync has the nastiest races; lean on the mp e2e + integration
gates. Once this + Phase 2 land, a perfect-info game's multiplayer glue collapses to
"an engine + three config objects."

---

## Phase 4 — New-game scaffold *(tooling, low–medium risk, biggest QoL)*

**Goal:** kill the "clone hive/ and delete the Hive parts" onboarding cost.

**Ship (in order of ambition):**
1. a `GAME-SETUP.md`: the checklist + copy-paste `firebase.json`, esbuild functions
   build line, emulator-seed layout, deploy workflow (incl. the invoker-IAM repair
   hive learned the hard way), CI matrix, and the `resolve.dedupe` list
   (`firebase-admin` / `@google-cloud/firestore` / `@mui/icons-material`) — the
   tribal knowledge currently scattered across hive's `DECISIONS.md`;
2. a `create-parlor-game <name>` script stamping the workspace skeleton
   (packages/{engine,app,functions}, tsconfig paths, link deps, config stubs, the
   templated rules/indexes from Phase 1).

**Size:** doc ~1 day; generator ~2–3. **Risk:** low, but the deploy/IAM notes are
load-bearing — lift them from hive's `DECISIONS.md` verbatim.

---

## Phase 5 — parlor's own docs *(low risk)*

Today you learn parlor by reading `lex/DESIGN.md §4`. Give parlor a real README:
the archetype it encodes, the four packages' surfaces, the injection points, and a
pointer to the Phase-4 setup guide. Bundle any new `.md` with a `DECISIONS.md`
entry (parlor's doc set is closed + line-budgeted).

---

## Out of scope

- **In-game UI primitives** (board renderer, drag layer, controller, result overlay)
  — genuinely game-specific; not a gap.
- **>2 players** — parked (a breaking epic touching the seat-fill lifecycle + the
  outcome model; see the seat-lifecycle and binary-result analysis).

---

## Sequence

**1 → 2 (2a+2b together) → 3 → 4 → 5.** Phase 1 de-risks the security surface first;
2–3 are the real dedup and share the "consumers' gates are the oracle" validation;
4 turns it into an actual SDK; 5 documents it. Each phase is one PR (parlor primitive
+ hive + lex + `lex/DESIGN §4`), green throughout.
