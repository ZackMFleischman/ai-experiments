# DESIGN.md — parlor/

The platform canon: what parlor is, where its code came from, and the
boundaries that keep it game-agnostic. Current-state only; decisions go to
`DECISIONS.md` here. (Moved from `lex/DESIGN.md` §4 — M6 — which now keeps
only lex's consumer stance.)

## 1. What parlor is

The game-agnostic layer for this repo's turn-based, two-player,
invite-a-friend PWA games on Firebase — plus the zero-backend brand stack for
the minimalist-apps titles. Its archetype: two seats, an
invite/challenge/rematch lifecycle, **server-authoritative** play (every
mutation is a Cloud Functions callable; clients never write game docs), an
append-only move log the client replays (or, for hidden-information games,
coherently adopts), async per-move deadlines, and web-push nudges. Packages
and their surfaces: `README.md`.

## 2. Origin — the hive port map

Parlor was extracted from shipped hive (M0–M5, live) with lex as the first
consumer forcing genericity. Every ported file carries a
`// ported from hive/<path> (adapted)` header; until M4 (hive convergence)
retires the last live twins, a bugfix in a ported file means **grep hive for
the twin** and flag it in the PR. What lives where:

| Parlor home | Ported from (hive) | What was genericized |
|---|---|---|
| `@parlor/core` transport seam | `app/src/controller/transport.ts`, `localStorageTransport.ts` | `GameTransport` over a generic entry type |
| `@parlor/core` `LogSession` | `GameController`'s log-sync + optimistic submit/rollback core (~1/3 of it) | selection/drag state machine stayed game-side |
| `@parlor/web` sync layer | `app/src/sync/` (firebase singleton, authContext, RequireAuth, AppSyncProviders, push, pushState, NotificationsSetup, lobby, gameApi) | doc field names beyond the shared meta set and payload types are type params/config |
| `@parlor/web/transport` | `firestoreTransport.ts`'s shared shell | `seatIndexOf`, `watchGameMeta` (incl. permission-denied delete-detection), `fetchOrderedMoves`/`watchAddedMoves`; the **sync strategy stays game-owned** — perfect-info games replay the log, lex keeps its coherent-adoption reads |
| `@parlor/web/lobby-ui` | lobby/landing presentation (`lobbyView`, `turnBadge`, `waitingView`, `Landing`+layout, `Join`/`JoinByCode`, `friendsFrom`/`InviteLinkView`) | game injects slots: thumbnail, card caption, empty motif, hero, join chips; summaries extend a generic seat-index `LobbySummary` |
| `@parlor/server` callables | `functions/src/games.ts` lifecycle + helpers (auth guard, invite codes, deadlines) | shaped by injected `GameServerConfig`; `createSubmitMove` takes only the game's engine `advance`; draw offers are opt-in `createDrawCallables` |
| `@parlor/server` notify/forfeit | `functions/src/notify.ts`, `forfeit.ts` | payload copy injected per game (`NotifyConfig`) |
| `@parlor/harness` | `/dev/gallery` runtime + `validate:visual`/`validate:ux` script cores | near-verbatim |
| `@parlor/web` theme/SW pieces | `theme.ts`, `sw.ts` (push display, deep-link, push-sync postMessage) | tokens re-skinned per game |

The zero-backend stack (`@parlor/solo`, `@parlor/arcade`, `@parlor/brand`,
`@parlor/native`) is not from hive — it was built for the brand titles;
`brand/` encodes the repo-root `DESIGN-PRINCIPLES.md`.

## 3. Copy-with-parity surfaces

`parlor/firestore.rules` + `firestore.indexes.json` are the canonical
declarative reference. Firebase requires these files inside each game's own
project dir (a `../parlor/…` path is rejected), so each duo game keeps a
physical copy and its `scripts/check-rules-parity.mjs` (wired into typecheck
AND re-run in the deploy workflows immediately before `firebase deploy`)
fails if the copy drifts from or weakens the base tiers or its indexes
differ. Added tiers are allowed (lex's owner-read rack / server-secret bag
override); weakened base tiers are not. Negative-path rules tests remain the
behavioral gate. Other stamped glue copies are policed by
`registry/check-stamps.mjs` (repo root).

## 4. Consumption mechanics

pnpm workspaces don't span repo roots, so games consume parlor as
**source-linked sibling packages**: `link:` dependencies + TS path mapping +
vite dedupe (wiring: `lex/IMPLEMENTATION.md` §1). `link:` deps don't install
the linked package's own deps — **install `parlor/` before any game**. Peer
dependencies (react, firebase, MUI, Capacitor) are declared by parlor and
provided by the consuming game, so parlor never pins a second framework copy;
`registry/check-peerdeps.mjs` polices resolved versions across lockfiles.

## 5. Boundaries & invariants

- **No game imports** (`@hive/*`, `@lex/*`, …) and no game concepts (tiles,
  words, hexes) — types are generic or injected. `scripts/check-boundaries.mjs`
  (wired into typecheck) builds the banned scope list from
  `registry/apps.json`.
- `@parlor/core` is zero-dependency, pure, deterministic TS — no
  `Date.now`/`Math.random`; seeds and clocks are inputs.
- Firebase imports only in `web/` and `server/`; Capacitor only in `native/`,
  reached via the injected bridge (`globalThis.Capacitor`), never an import —
  every wrapper no-ops in a plain browser.
- Consumers import export-map surfaces only — deep `@parlor/<pkg>/src|dist|lib`
  imports fail every game's boundary lint.
- **Breaking a `@parlor/*` public interface requires updating the consumers
  and this file in the same PR.**
- Parlor has no task list: it grows only in service of a consumer's task
  (build tasks live in `lex/IMPLEMENTATION.md`).
