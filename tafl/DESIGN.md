# DESIGN — Tafl

How the pieces fit. Requirements in `REQUIREMENTS.md`; the platform's
canonical surfaces are the parlor source + `lex/DESIGN.md` §4; the setup
recipe this app was built from is the repo-root `GAME-SETUP.md`.

## §1 Shape

Independent pnpm workspace, sibling of `parlor/` (source-linked `link:` +
tsconfig paths + vite dedupe):

- `packages/engine` — `@tafl/engine`, the pure hnefatafl kernel.
- `packages/app` — `@tafl/app`, React PWA over `@parlor/{core,web,brand}`.
- `packages/functions` — `@tafl/functions`, Cloud Functions =
  `@parlor/server` shells over tafl's config.
- `e2e` — Playwright (hot-seat smoke + visual gallery).
- `firestore.rules`/`.indexes.json` — parlor's canonical copies, verbatim
  (perfect information: base three tiers, parity-linted).

## §2 Engine

Plain state (`board` 121-char string, `toMove`, `seen` repetition ledger,
`result`) + pure functions: `legalDestinations` (ray walk),
`applyTafl` (validate → move → custodian captures → ordered result
checks: capture > escape > no-moves > repetition), `resignTafl`/
`timeoutTafl` markers for meta entries. The initial position seeds `seen`,
so returning to the opening twice draws. Serialization is validated JSON.

## §3 Seats are sides

The one design idea everything else leans on: `seatKeys = ['attackers',
'defenders']` and the engine's `toMove` uses the same strings. Parlor's
seat-key defaults (`toMove: seatKeys[0]` at create, seat-keyed `result`,
`isMyTurn` = `players[toMove] === uid`) are therefore already the engine's
truth — no color↔seat mapping layer, and `createForfeitHandlers` works
unmodified. Hive (w/b) and lex (p0/p1) both carry that extra layer; a new
game shouldn't (this is a generator lesson, see IMPLEMENTATION §3).

## §4 Server

`taflServerConfig`: options = `{timeControl}` only (one ruleset);
`initialGame` puts the full serialized engine state on the doc (no
subdocs, no racks). `submitMove.advance` deserializes the snapshot, runs
`applyTafl`, writes the new snapshot + `{kind:'move', from, to, name}`
move doc, maps `state.result` → seat-keyed terminal. Draw callables are
deliberately absent — tafl's only draw is engine-derived (repetition).

## §5 Client

Both play modes are one `LogSession` fold (`game/entries.ts`): hot-seat
over `LocalStorageTransport`, online over `sync/firestoreTransport.ts` —
the log-replay strategy (`fetchOrderedMoves` + `watchAddedMoves` +
engine replay, with the snapshot regression check on load). Writes go
through typed callables. `GameScreen` renders either mode (perspective
locked online); `Board` renders `legalDestinations()` only. Lobby/landing/
join/waiting are `@parlor/web/lobby-ui` slots filled with tafl's MiniBoard
thumbnail, caption, and chips. The brand shell (`@parlor/brand` theme +
AppShell, teal accent) replaces the hand-rolled theme.ts hive/lex carry —
tafl is the brand's first duo title; `MoreFromUs` joins post-launch.

## §6 Testing

Engine 50 (incl. seeded random-game property, widened by `validate:m1`);
app 7 jsdom (real click-move fold, persistence, resign, shells); functions
19 against live emulators (callables happy/negative paths, rigged
positions via admin updateMask writes, security rules negative suite);
Playwright hot-seat smoke + 36-capture visual gallery. CI runs all of it
(`tafl-ci.yml`: parlor gate, checks + emulator, validate).
