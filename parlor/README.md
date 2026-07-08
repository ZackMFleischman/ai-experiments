# PARLOR

The shared, game-agnostic platform layer for this repo's parlor games —
turn-based, two-player, invite-a-friend PWAs on Firebase. Ported from `hive/`'s
proven platform code (every file carries a `// ported from hive/<path>` header);
**`lex/`** is the first consumer; hive now consumes the `@parlor/web` platform
layer and its shared lobby UI too (only its backend migration remains).

Independent pnpm workspace. Packages (TS source, no build step):

- **`@parlor/core`** — zero-dependency: the `GameTransport` seam, `LogSession`
  (optimistic submit/rollback over an append-only log), localStorage transport.
- **`@parlor/web`** — React + Firebase client layer: configurable app init,
  the auth seam (hot-seat/full context + route guard + provider stack), the
  callable client factory, the lobby listener hook (doc→summary mapping is the
  game's), the (`./transport`) FirestoreTransport shell — seat resolution, the
  game-doc meta listener with delete-detection, and the log-replay reads (the
  sync strategy stays the game's), and (`./lobby-ui`) the shared lobby/landing presentation — grouped
  game list, turn badge, invite/waiting/join screens, landing shell — with the
  game injecting its thumbnail, card caption, empty motif, hero, and option
  chips. Peer deps: react, firebase, MUI (the game provides them). Root entry
  is firebase-free; SDK surfaces sit behind subpath exports.
- **`@parlor/server`** — Cloud Functions building blocks: the shared callables
  (create/join/cancel/challenge/respond/rematch/resign) shaped by an injected
  `GameServerConfig` (seats, options, initial state, racks), the `createSubmitMove`
  shell (the game injects only its engine `advance`), the opt-in `createDrawCallables`
  capability, plus the notify machinery.
- **`@parlor/harness`** — the `/dev/gallery` runtime and `validate:visual` /
  `validate:ux` script cores.

Consumed by sibling workspaces via `link:` dependencies + TS path mapping —
wiring documented in `lex/IMPLEMENTATION.md` §1 (run `pnpm install` here first).

Hard rule: **no game imports** (`@lex/*`, `@hive/*`) — machine-checked. Design
rationale and the port map live in `lex/DESIGN.md` §4; build tasks live in
`lex/IMPLEMENTATION.md` (parlor grows only in service of a consumer's task).
