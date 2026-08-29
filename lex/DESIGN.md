# LEX — Design Doc

A digital **crossword tile game** for two to four players (Scrabble /
Words-with-Friends family), built as a **PWA** so people in different states play
**synchronously or asynchronously** — same shape as its sibling project
[`hive/`](../hive/DESIGN.md), from which this project deliberately inherits its
architecture, backend, validation harness, and much of its code (§4).

> Scrabble is a trademark of Hasbro/Mattel; Words with Friends of Zynga. This is a
> private, non-commercial project for personal play. Because the classic board layout
> and letter distribution are the trademark-adjacent parts, **both are data, not code**
> (§2.2): swapping to an original layout/tileset is a one-file change, by requirement.

The name is "LEX" (fittingly, a playable word). Renaming would be a find-replace
plus a DNS choice; nothing in the architecture depends on it.

The complete numbered feature inventory lives in
[REQUIREMENTS.md](./REQUIREMENTS.md); this document is the *how and why* behind
those requirements and cross-references them where useful.

---

## 1. Goals & non-goals

### Goals (v1)

- **Two-player over the internet.** Create a game, send an invite link or challenge a
  past opponent, play.
- **Async or sync, seamlessly.** No mode switch: a game is shared state updating in
  real time. Both online ⇒ feels live; otherwise you get a push when it's your turn.
- **Great placement UX.** Drag tiles from a rack to the board (tap-tap fallback),
  with live feedback: a preview card of the words it forms, their scores and
  validity, the total; recall, shuffle, blank designation.
- **Dictionary-enforced plays** (Words-with-Friends style): an invalid word can't be
  played — the app tells you which word failed. No challenge mechanic (§2.3).
- **…or invalid words cost the turn, per game.** Same dictionary, opposite
  bargain: the app says nothing until you commit, and a word it won't take costs
  you the turn (§2.3). A setting picked at creation alongside the board, the word
  list and the clock — not a difficulty tier.
- **Swappable board layout, tileset, and dictionary** — first-class architectural
  requirement, not a nice-to-have (§2.2) — and the **board layout and dictionary
  are chosen per game at creation** (v1 ships two of each).
- **Turn awareness & notifications.** Push ("Sam played QUIZ for 68 — your move"),
  lobby badges, icon badge.
- **Multiple concurrent games** per account; lobby grouped by your-turn/waiting.
- **Responsive PWA.** Phone, iPad, desktop; installable; same account everywhere.
- **Robust.** Server-validated moves running the same engine; racks and bag are
  **server-secret** (§3.3) — you can't cheat by reading the wire.

### Non-goals (v1)

- No AI opponent (architecture leaves the door open — engine is a pure library; a
  DAWG-based move generator is a natural `@lex/ai` package later).
- No 3–4 player games (engine models N players from day one — arrays, seat indexes —
  but lobby/invite/notification flows assume 2 seats in v1).
- No opponent-adjudicated challenges (the dictionary settles phoneys itself, §2.3), no
  ratings, no public matchmaking, no chat, no analysis.
- No native app store builds — PWA only.
- No monetization; no hardening beyond "players can't cheat."

---

## 2. Rules scope

### 2.1 Core rules (pinned)

Standard crossword-game rules. Dictionary strictness is the one per-game choice
among them (§2.3); everything below holds under both settings:

- **Board:** 15×15 grid with premium squares (double/triple letter, double/triple
  word); the center square starts play and is a double-word square. Layout is data
  (§2.2); the default is the classic arrangement (8 TW, 17 DW incl. center, 12 TL,
  24 DL).
- **Tiles:** 100 tiles — the standard English distribution and point values,
  including 2 blanks (0 points, letter designated on placement, permanent once
  played). Also data (§2.2); a fixture pins the default set at 100 tiles / 187 points.
- **Racks:** 7 tiles, refilled to 7 from the bag after every play while tiles remain.
- **A play** places 1+ tiles from the rack in a single row or column such that:
  the placed tiles plus existing tiles form one contiguous main word; the first play
  covers the center square and uses ≥2 tiles; every later play connects to at least
  one existing tile. Every word formed (main + cross-words) must be in the
  dictionary; the game's `invalidWords` setting decides what happens otherwise —
  the whole play is rejected naming the offending words, or it costs the turn
  (§2.3).
- **Scoring:** letter premiums apply to newly placed tiles only; word premiums
  multiply (two DWs under one word ⇒ ×4) and also count only when newly covered;
  cross-words score too; placing all `rackSize` (7) tiles in one play is a **bingo**
  (+50). Premium squares never re-count on later plays.
- **Exchange:** on your turn, swap any number of rack tiles with the bag, if the bag
  holds ≥ 7 tiles. Costs the turn.
- **Pass:** always allowed; costs the turn.
- **Game end:**
  1. The bag is empty and one active player plays out their last tile ⇒ that
     player adds the sum of every other **active** rack; each of those deducts its
     own. Withdrawn seats hold nothing and sit the pot out.
  2. **`scorelessRounds` scoreless turns per active seat** (pass, exchange, a
     0-point play, or a phoney) ⇒ game ends; each player still holding tiles
     deducts their own remaining points. The knob is 3, so it is six turns at two
     seats — unchanged — nine at three, twelve at four.
  3. Resignation, or timeout under an async time control (§6.4). At two seats
     that ends the game; at three or four it is a **withdrawal** — that player
     is out, their score freezes, their rack goes back to the bag, and the turn
     order skips them (DECISIONS 2026-08-28).
  4. **One active player left** (`last-standing`) ⇒ game ends with no adjustment:
     every other rack is already back in the bag, and the survivor's tiles never
     came off a natural ending.
- Higher adjusted score wins; equal ⇒ **draw** (no first-player tiebreak).

### 2.2 Configurable surfaces (the "easily changeable" requirement)

The rules parameterization lives in one immutable value, the **`Ruleset`**, with
the dictionary chosen **independently** per game (so any board pairs with any
word list):

```
Ruleset = {
  board:   BoardLayout      // rows, cols, premium map, start cell
  tiles:   TileSet          // per-letter count + points, blank count
  rackSize, bingoBonus, exchangeMinBag
  scorelessRounds           // scoreless turns × active seats end the game
  players: {min, max}       // seat counts this ruleset can be dealt for
}
GameOptions = { rulesetId, dictionaryId, timeControl, invalidWords }  // pinned at creation (FR-6..11)
```

- The engine computes **everything** — geometry, scoring, end conditions — from the
  `Ruleset`; no dimension, premium, letter count, or bonus is hard-coded anywhere.
  The **seat range is one of those dimensions** (a reduced-tile board cannot deal
  four racks), so `initialState` refuses a count outside `players`.
- Rulesets live in a registry in `@lex/engine` keyed by id. **v1 ships two**, both
  15×15 over the standard tile set, differing only in premium arrangement:
  `classic` (the traditional layout) and `modern` (a WWF-style layout). Games
  store the **id**; registry entries are immutable — changing a ruleset means
  adding a new id, so finished games always replay under their original rules.
- Dictionaries are swappable assets behind a 2-method interface with their own
  registry in `@lex/dict` (§5.4). **v1 ships two**, both public domain:
  `enable1` ("Tournament-style", ~173k words) and `2of12inf` ("Everyday words",
  ~82k — the 12dicts common-vocabulary list, friendlier for casual play).
- **Both are picked in the New Game flow** (FR-6/FR-7), shown to the invitee
  before accepting, and immutable afterwards (§7.1).
- **`invalidWords` is a `GameOptions` setting, not a `Ruleset` field** (FR-9b).
  It is orthogonal to both the board and the word list — every combination is a
  sensible game — so putting it in the `Ruleset` would mean a registry entry per
  board × rule, and would falsely imply that finished games' *boards* differ. The
  engine takes it per call instead (`applyMove`'s `MoveOptions`, §5.2), which
  also keeps the `Ruleset` what it says it is: the shape of the board and the
  tiles. It sits beside `dictionaryId` for the same reason the dictionary sits
  outside the `Ruleset`: it is a choice about the word list's *authority*, not
  about the board.
- Board size is *not* assumed 15×15 by the UI: the grid renders `rows × cols` from
  the layout, and the viewport auto-fits (§7.2). An 11×11 quick-play board (with a
  reduced tile set) is a post-v1 registry entry.

### 2.3 Meta rules

- **Resign** any time. No draw offers (unlike hive — draws arise naturally from tied
  scores, and offer flows would be dead UI; cut per §9.6).
- **Time controls:** per-move async deadlines (`1 / 3 / 7 days` or none), timeout ⇒
  loss — identical semantics and machinery to hive (§6.4). Real-time clocks post-v1.
- **Turn order:** chosen at creation (me / them / random, default random); rematch
  rotates the order by one, which at two seats is the swap it always was.
- **Before a 3+ game starts** there is a **guest list**, not seats: a `roster` in
  join order (host first), `invited`, and `declined`. An invitation reserves
  nothing — first to arrive is next — and a decline moves a name rather than
  deleting the game (DECISIONS 2026-08-28). Seats and the deal appear only at the
  start, so `invites/{code}` publishes a **uid-free** name-and-count preview.
- **Invalid words:** what happens to a play whose words aren't all in the
  dictionary is **chosen per game** (`invalidWords`, FR-9b) — picked at creation
  like the board, the word list and the clock, and named for the rule rather
  than for a difficulty:
  - **`'blocked'`** — "Can't be played", the default. Such a play is not a move
    at all: the preview marks the offending word ✗ before you commit and Play
    stays disabled; the server rejects it if a client tries anyway.
  - **`'costs-turn'`** — "Cost your turn". The app **withholds** the verdict (the
    preview shows words, scores and the total but no ✓/✗) and a play the
    dictionary refuses is a **phoney**: it places nothing, scores nothing, and
    spends the turn (feeding the scoreless run, §2.1).

  Geometry and rack legality are identical under both — which is why the engine
  keeps its geometry and dictionary checks separate (§5.2): a second consequence
  for stage 3, not a second pipeline.
- Neither is a **challenge** mechanic (opponent adjudicates): the dictionary
  arbitrates either way, so a phoney is caught when played rather than left
  standing until doubted. Nothing is hidden that isn't already — see §3.3.

### 2.4 Notation & the move log

The move log is a collection of **typed entries** (`play` with explicit placements,
blanks, words, and score; `exchange` with a tile *count* publicly; `pass`; plus meta
`resign`/`timeout`) — JSON, not a string format, because placements with blank
designations are unambiguous that way and the wire format equals the storage format.
A `resign`/`timeout` entry at three or four seats records a **withdrawal**, not an
ending, and advances the move count like any other entry, so the turn cursor and
`expectedMoveCount` stay in step with the log.

For fixtures, human-auditable records, and interop, the engine also speaks
**GCG-style notation** (the community-standard crossword game format): coordinates
like `8D` (row-first = horizontal) / `D8` (column-first = vertical), blanks as
lowercase letters, e.g. `H4 QUIZzed +68`. `toGcg`/`parseGcg` round-trip every test
fixture; a full-game `.gcg` exporter is post-v1.

Unlike hive, **the public log alone cannot reconstruct full state** — draws are
hidden information. Reconstruction inputs are: public log + the server-private draw
log (§6.2). This is the project's central architectural delta from hive and is
designed for explicitly in §3.3.

---

## 3. Architecture

### 3.1 Principle: the game is a library, the app is a client (inherited)

Identical to hive §3.1: the rules engine is a **pure, zero-dependency TypeScript
package** consumed by the web UI, the server-side validator, tests, and (later) an
AI. Same three layers: engine (model) / controller / view. Same hard rule: **the UI
never computes rules** — it calls engine verdict functions on candidate plays and
renders the result.

```
lex/
├── DESIGN.md                   # this document
├── IMPLEMENTATION.md           # ordered task list + build protocol
├── package.json                # pnpm workspace root (independent of hive/)
├── packages/
│   ├── engine/                 # @lex/engine — pure rules kernel (zero deps)
│   │   └── src/
│   │       ├── ruleset.ts      # Ruleset/BoardLayout/TileSet types + `classic` registry
│   │       ├── board.ts        # grid cells, word extraction, connectivity
│   │       ├── validate.ts     # checkPlay: geometry + rack legality, words formed
│   │       ├── score.ts        # premium/cross-word/bingo scoring
│   │       ├── state.ts        # GameState (full) / PlayerView (projected), bag & draw
│   │       ├── engine.ts       # applyMove, result, end-game adjustments
│   │       ├── gcg.ts          # GCG-style parse/serialize
│   │       └── serialize.ts    # full + public state round-trips
│   ├── dict/                   # @lex/dict — word lists compiled to a compact DAWG
│   │   ├── words/enable1.txt   # vendored public-domain list (+ LICENSE note)
│   │   └── src/                # build script, loader, Dictionary implementation
│   ├── app/                    # @lex/app — React + MUI + Vite PWA
│   │   └── src/
│   │       ├── screens/        # Landing, Lobby, NewGame, Join, Game, Settings
│   │       ├── board/          # grid board, rack tray, drag layer, viewport
│   │       ├── controller/     # GameController: engine ↔ UI ↔ transport
│   │       ├── sync/           # thin game-specific bindings over @parlor/web
│   │       └── dev/            # /dev/gallery entries
│   └── functions/              # @lex/functions — all callables are @parlor/server shells (submitMove = createSubmitMove + lex's engine advance)
└── e2e/                        # Playwright: two-browser full-game tests

../parlor/                      # SIBLING WORKSPACE at the repo root (§4): the
├── packages/                   # game-agnostic platform layer, ported from hive
│   ├── core/                   # @parlor/core — transport seam, log session, optimistic queue (zero deps)
│   ├── web/                    # @parlor/web — firebase init, auth, push, lobby queries, providers (React)
│   ├── server/                 # @parlor/server — callable shells, notify, forfeit, invite/challenge/rematch
│   └── harness/                # @parlor/harness — gallery runtime, validate script cores
└── README.md                   # parlor's own rules; build tasks live in lex/IMPLEMENTATION.md
```

### 3.2 The three layers (deltas from hive only)

1. **Model (`@lex/engine`).** Two state shapes, because of hidden information:
   - `GameState` — **full** state (board, both racks, bag order, scores). Exists
     only server-side and in hot-seat mode.
   - `PlayerView` — what one player may know: board, **own** rack, scores, bag
     *count*, opponent rack *count*. `playerView(state, seat)` is the only
     projection, and a property test asserts it never leaks (§10).
   - There is no `legalMoves()` — enumerating all crossword plays is an anagram
     search the UI doesn't need. The UI's contract is instead **verdict functions**:
     `checkPlay` (geometry + rack), `scorePlay`, and dictionary lookups, all of
     which need only `PlayerView`-level knowledge. Full enumeration is an AI
     concern, post-v1.
2. **Controller.** Same optimistic-apply/rollback pattern over the same
   `GameTransport` seam as hive, plus lex-specific derived state: the **pending
   placement set** (tiles staged on the board but not submitted), live
   words/score/validity preview, exchange selection, blank designation.
3. **View.** React + MUI, renders controller state only. The board is a DOM/CSS
   grid rather than hive's SVG (§7.2 says why).

### 3.3 Hidden information (the big delta from hive)

Hive is perfect-information: ship everyone the whole state. Lex is not — a player
must never be able to read the opponent's rack or the bag, **including from raw
Firestore**. Consequences, designed once here and referenced everywhere:

- **Randomness at the edge, determinism inside.** The engine never shuffles: it
  takes a pre-shuffled bag order as input (`initialState(ruleset, bagOrder)`) and
  draws from it deterministically. Shuffling happens exactly twice, both server-side
  with crypto randomness: at `createGame`, and re-shuffling the remainder on each
  `exchange`. Hot-seat mode shuffles in the local transport. Tests inject fixed
  orders — the whole engine stays as deterministic as hive's.
- **Three storage tiers per game** (schema in §6.2): the public game doc + move log
  (board, scores, counts — readable by both players); a per-player **rack doc**
  readable only by its owner; a **private bag doc** readable by no client at all
  (Cloud Functions only). Firestore rules tests assert all three boundaries (§10).
- **Public log + private draw log = full replay.** The private doc records the
  initial bag order and each exchange's re-shuffle, keyed to move numbers, so the
  server can always reconstruct `GameState` exactly — preserving hive's
  "log is the source of truth" property, split across a public and a private half.
- **Exchanges are private.** The public move entry records only *how many* tiles
  were exchanged; which letters went back is server-private.
- **A phoney IS made public, words and all — the one deliberate opening in this
  section.** A refused play changes nothing on the board, so it is a pass unless
  the app says otherwise. It says so three times — a strip under the score bar
  (§7.2), the score-sheet row (✗/red/0, not merely worded), and the opponent's
  push — each naming the player, **the words tried**, and the cost, as an
  over-the-board challenge shows a phoney before withdrawing it. Published is the
  **words the play formed** — never the placements, a score, or the rest of the
  rack. That bound keeps this section true: a formed word can include tiles
  already on the board, so it discloses at most the tiles it consumed. The entry
  carries `kind: 'phoney'` plus `phoney.words`, nothing else.
- **Optimistic play still works** because play legality and scoring depend only on
  public board + own rack: the client fully validates and scores locally, applies
  optimistically, and the only thing it must wait for is its **refill** — which
  arrives via its own rack-doc listener after the server draws.

### 3.4 Open/closed seams

- **Ruleset registry** (§2.2): new board/tileset/rule-knob combinations are data.
- **Dictionary interface** (§5.4): new word lists are assets, not code.
- **`GameTransport`** (from hive): hot-seat, localStorage, and Firestore backends
  behind one interface; an AI opponent later is just another transport peer.
- **N players:** the engine and the parlor server are seat-indexed throughout
  (`seatKeys` is a list, `Ruleset.players`/`GameServerConfig.players` declare the
  range); the lobby/UI surfaces are the last place two seats are assumed.
- **Tile skinning:** tile/board visuals are CSS-variable-driven themes (the hive
  "bear mode" lesson institutionalized): rules and engine never see the skin.
- **Backend swap:** Firebase confined to `@parlor/web`, `@parlor/server`,
  `app/src/sync/`, and `packages/functions` — same discipline as hive's.

---

## 4. What we take from hive — reuse analysis

Hive shipped M0–M5 and is live; its DESIGN/IMPLEMENTATION/DECISIONS record both the
architecture and the hard-won fixes (emulator long-polling, pinch containment,
SW push-sync, functions bundling, IAM repair…). Lex's stance, per surface:

**Reuse the design wholesale (this document mostly writes deltas):** the three-layer
architecture, the Firebase choice and rationale (hive §5.1 — every driver applies
verbatim), server-authoritative callables, the emulator-first dev loop, the PWA/push
approach, async time controls, the milestone-gate + `/dev/gallery` + screenshot-review
validation harness, and the CI-enforced documentation policy.

**Share — port into the repo-level `parlor/` workspace, genericized (game-agnostic
by construction):**

| Hive source | Becomes | Notes |
|---|---|---|
| `app/src/controller/transport.ts`, `localStorageTransport.ts` | `@parlor/core` | `GameTransport` with a generic entry type instead of hive's `LogEntry` |
| `GameController`'s log-sync + optimistic-submit/rollback core (~1/3 of it) | `@parlor/core` `LogSession` | the hex selection/drag state machine parts are hive-specific — not ported |
| `app/src/sync/firebase.ts, authContext.ts, RequireAuth.tsx, AppSyncProviders.tsx, push.ts, pushState.ts, NotificationsSetup.tsx, lobby.ts, gameApi.ts, firestoreTransport.ts` | `@parlor/web` | game-specific bits (doc field names beyond the shared meta set, payload types) become type params/config. `firestoreTransport.ts` keeps its class game-side but its shared shell — `seatIndexOf`, `watchGameMeta` (incl. the permission-denied **delete-detection**), and the log-replay reads `fetchOrderedMoves`/`watchAddedMoves` — is `@parlor/web/transport`. The **sync strategy** is game-owned: hive/perfect-info games replay the log (those two reads); lex keeps its hidden-info **coherent-adoption** strategy (re-read game+rack+log per signal, coherence + monotonic gates) — the plan's allowed "leave it game-provided". The monotonic gate counts **withdrawals as well as moves**, because a withdrawal advances the game without advancing `moveCount`; and the rack-currency gate is skipped for a seat that has withdrawn, whose empty rack is stamped with the move count it left at rather than one of its own moves. |
| the lobby/landing **presentation**: `screens/lobbyView` (grouped list + cards), `turnBadge`, `waitingView` (invite/waiting/challenge), `Landing`+`LandingLayout` shell, `Join` card + `JoinByCode`, `newGameView`'s `friendsFrom`/`InviteLinkView` | `@parlor/web` (`./lobby-ui`) | game injects the slots — board thumbnail, card caption, empty-state motif, landing hero, join-detail chips; the lobby summary EXTENDS a generic `LobbySummary` (seat-index meta). Each `screens/*` file is now a thin wrapper binding lex's slots. |
| `functions/src/games.ts` create/join/cancel/challenge/respond/rematch + helpers (auth guard, invite codes, deadlines) | `@parlor/server` | `submitMove`'s transaction shell (load → turn check → concurrency guard → moveCount/deadline bookkeeping → write + push) is now extracted as `createSubmitMove`; lex injects only its engine `advance`. Draw offers are `createDrawCallables` (opt-in capability) — lex opts out. **Seats are a list, not a pair:** `seatKeys`/`rackDocs` are arrays, `players: {min,max}` declares the range (default `{2,2}`), `initialGame` receives the count, and `parseSeatChoice` returns a `TurnOrderChoice` — a bare seat index still means "the creator takes this seat", which is what the `me`/`them`/`random` wire values have always produced |
| `functions/src/notify.ts`, `forfeit.ts` | `@parlor/server` | payload copy injected per game |
| `app/src/dev/Gallery.tsx` + registry pattern, `validate:visual`/`validate:ux` script cores, `scripts/check-docs.mjs`, `check-bundle.mjs`, icon/card build scripts | `@parlor/harness` (+ thin `scripts/` wrappers in lex) | near-verbatim |
| `app/src/theme.ts`, `sw.ts` (push display, deep-link, push-sync postMessage) | `@parlor/web` | theme tokens re-skinned per game |
| `firestore.rules` (base tiers) + `firestore.indexes.json` | `parlor/firestore.rules` + `parlor/firestore.indexes.json` (canonical declarative reference, not TS) | Firebase requires these files inside each game's own project dir (a `../parlor/...` path is rejected), so each game keeps a copy; `scripts/check-rules-parity.mjs` (in `pnpm typecheck`) fails if the copy drifts from/weakens the base or its indexes differ. Perfect-info games track the base verbatim; lex adds the **racks/private** override (owner-read rack, server-secret bag), which the reference documents — parity allows added tiers, forbids weakened base ones. Negative-path rules tests stay the behavioral gate. |

`@parlor/*` **must not import any game package** (`@lex/*`, `@hive/*` —
machine-checked, IMPLEMENTATION §3) — that's what keeps it honestly generic.

**Copy-adapt — start from the hive file, edit meaningfully (screens are ~layout-
identical but content-different; infra files differ in names/fields):** the
game-specific screen shells + slots that wrap the shared `./lobby-ui` above —
`Lobby`/`NewGame` route shells, `newGameView`'s `NewGameForm` (board/dictionary/
turn/time controls — too game-shaped to share, so it stays here), `Settings`,
Game chrome — plus `game/*`
(PlayerBar, GameMenu, MoveList → score sheet, ResultOverlay), `board/BoardViewport`
(pan/zoom/pinch math — keep; SVG specifics → CSS transform), `firestore.rules`
(only the rack/bag override; base tiers are the shared parlor reference above),
`firebase.json` + emulator seed, CI workflows + deploy job
(incl. the invoker-repair step), the e2e `test-harness` module, `e2e/visual-checklist.md`
skeleton, and the doc set itself (CLAUDE/DESIGN/IMPLEMENTATION/DECISIONS structure).

**Rewrite — game-specific, no useful hive counterpart:** all of `@lex/engine`
(different game), `@lex/dict` (new concern), board grid + tile + rack-tray
components, pending-placement UX (the preview card, recall, blank picker, exchange
mode), the hot-seat **pass-device** privacy interstitial, sprite/art assets
(lex tiles are typography — far lighter art burden than hive's 16 glyphs).

**The shared library is repo-level from day one (owner decision): `parlor/`** —
named for what it is, a parlor-games platform: the game-agnostic layer for
turn-based, 2–4-player, invite-a-friend PWA games on Firebase. It is its own pnpm
workspace at the repo root with four packages (`@parlor/core`, `@parlor/web`,
`@parlor/server`, `@parlor/harness`), its own tests and CI, and **no game
imports** — lex was its first consumer; hive now consumes the `@parlor/web`
platform layer and shares its lobby UI too (only the backend migration remains).
Consumption mechanics — pnpm workspaces don't span repo roots, so lex consumes
parlor as **source-linked sibling packages** (`link:` dependencies + TS path
mapping; exact wiring in IMPLEMENTATION §1). Peer dependencies (react, firebase,
MUI) are declared by parlor and provided by the consuming game, so parlor never
pins a second copy of a framework. Divergence risk against hive's originals (a bug
fixed in hive but not in the port) is contained by provenance headers — every
ported file names its hive source path, so fixes are greppable to their twin —
and shrinks to zero when hive migrates.

---

## 5. Rules engine design

### 5.1 Board & state representation

- Cells are `{row, col}` (0-based), key `"row,col"`. The board is a sparse
  `ReadonlyMap<CellKey, PlacedTile>` — only occupied cells — sized/bounded by the
  `BoardLayout`.
- `PlacedTile = { letter, isBlank }`; points always come from the `TileSet`
  (blanks score 0 regardless of designated letter).
- Racks and bag hold `TileFace = 'A'…'Z' | '?'`. The bag is an ordered array;
  the **front is the next draw** — order is the injected randomness (§3.3).
- Full `GameState`: ruleset id, board, per-seat racks, bag, per-seat scores,
  `toMove` seat, `moveCount`, `scorelessRun`, and `withdrawn` (the seats that have
  left, ascending). `PlayerView`: same minus other racks and bag contents (counts
  only) — who withdrew is public, so `withdrawn` projects through unchanged.
- **Turn order is engine output, never UI arithmetic.** `turnQueue(state)` is the
  rotation from `toMove` with withdrawn seats dropped; screens render it.

### 5.2 Verdict pipeline (what replaces hive's `legalMoves`)

A candidate play flows through three pure, separately callable stages — separate so
the UI can give precise live feedback and so a `'costs-turn'` game (§2.3) can
hold stage 3 back from the player without holding it back from the engine:

1. **`checkPlay(board, rack, placements, ruleset)`** — geometry + rack legality:
   tiles come from the rack (blank designations legal), single line, contiguity
   through existing tiles, first-play center + ≥2 tiles, connectivity. Returns the
   **words formed** (main + cross) with their cells, or a typed rejection reason.
2. **`scorePlay(board, placements, ruleset)`** — per-word scores (letter premiums on
   new tiles only; word multipliers stack; premiums spent once), bingo flag, total.
3. **Dictionary verdicts** — `dict.has(word)` per formed word; all must pass.
   Callable on its own as `rejectedWords(words, dict)`, which names the refused
   words in play order (empty ⇒ the play scores). It exists as an export because
   a `'costs-turn'` game needs this verdict *after* the commit — to record the
   phoney — as well as before it, and one definition beats three.

`applyMove(state, move, dict, options?)` runs the full pipeline (for `play`),
enforces exchange/pass legality, draws refills from the bag, updates
`scorelessRun` (pass, exchange, 0-point plays and phoneys increment; scoring plays
reset), and — when the move ends the game — applies the end adjustments of §2.1 so
`state.scores` is final. `result(state)` then just reads. Illegal input throws
`IllegalMoveError`, same contract as hive.

`options: MoveOptions = { invalidWords? }` carries the per-game settings of §2.2
(`InvalidWordRule = 'blocked' | 'costs-turn'`, exported so the client and server
option twins share one vocabulary). It changes **one** branch: a play whose
stage-3 verdict fails. `'blocked'` (the default) ⇒ `IllegalMoveError('invalid-word')`
naming the words, as before. `'costs-turn'` ⇒ the move is applied as a **phoney**:
board, racks, bag and scores are untouched, only `toMove`, `moveCount` and
`scorelessRun` advance. Stages 1 and 2 are unaffected either way, so the setting
can never make an illegal placement legal. It needs no marker in the log:
replaying the same entries against the same dictionary reaches the same verdict,
so a phoney is re-derived, not remembered.

`withdraw(state, seat)` is the one transition that is not a move: it empties that
seat's rack into the **bag end** for the server to re-shuffle (the machinery
exchange already uses, §3.3), records the seat in `withdrawn`, advances
`moveCount`, and passes the turn on if it was theirs. Every seat scan — turn
advance, the played-out test, the end adjustments — runs over **active** seats
only, so a withdrawal never ends the game by itself.

`result(state)` reports **`standings`** — placings best-first, an inner array of
two or more seats being a tie — not a single winner. Everyone who finished ranks
above everyone who withdrew, and only then by score, so resigning while ahead
cannot bank a placing (DECISIONS 2026-08-28).

### 5.3 Algorithms (the interesting parts)

All trivially cheap at 15×15 — the engine's difficulty is edge-case correctness,
not performance:

- **Word extraction:** from any placement set, scan the main line to its maximal
  contiguous extent, then perpendicular scans per placed tile; a cross "word" of
  length 1 is not a word (no dictionary check, no score).
- **Contiguity with gaps:** placed tiles may be non-adjacent to each other so long
  as intervening cells are already occupied — validated by walking the main line.
- **Scoring:** single pass per formed word, accumulating letter values (×premium if
  that cell was placed this turn) and a word-multiplier product (likewise).
- **End adjustments:** pure function of racks + tileset points, applied by the
  terminal `applyMove`.
- **Draw:** `splice` from bag front; refill to `rackSize` or bag exhaustion.

### 5.4 Dictionary (`@lex/dict`)

- Interface the engine sees: `{ id: string; has(word: string): boolean }` — the
  engine stays zero-dep; the dictionary is injected.
- `@lex/dict` owns the **dictionary registry**: `DICTIONARIES` metadata
  (id, display name, description, word count — what the New Game picker renders,
  FR-7) plus `loadDictionary(id)`. v1 ships three lists: two public-domain —
  **`enable1`** ("Tournament-style", ENABLE, ~173k words) and **`2of12inf`**
  ("Everyday words", the 12dicts common-vocabulary inflected list, ~82k words —
  friendlier for casual play) — plus **`nwl2023`** ("North American (NWL2023)",
  the NASPA Word List 2023, ~197k words; copyrighted, vendored at the owner's
  direction, see `packages/dict/words/README.md`). Exact counts pinned at vendor
  time. Other copyrighted lists (SOWPODS/CSW) are the owner's call — each is just
  a new registry entry + word file (§2.2).
- A build script compiles each word list into a **compact binary DAWG** (target
  ≤ 800 KB each, generated at build — not committed). The app lazily loads the
  dictionary **of the game being viewed** (cached by the service worker); the
  functions deploy bundles both. Lookups are microseconds; the client validates
  as you place tiles with zero latency.
- Same list version on client and server, pinned by dictionary id + a content hash
  the tests assert, so client and server can never disagree on a word.

---

## 6. Backend

### 6.1 Choice: Firebase — inherited from hive verbatim

Every decision driver in hive §5.1 applies unchanged (realtime sync, Web Push,
auth, no ops, free at friends-scale), plus one new one: **hidden information wants a
server**, and lex already has one — the same callable pattern hive uses for
anti-cheat carries the rack/bag secrecy (§3.3) for free. Same project shape too: a
new Firebase project (`lex-zmf`), Google sign-in only, emulator suite for all dev
and CI (hive §5.5–§5.6 apply as written, including Blaze plan, VAPID key, deploy
service account, and preview-channel strategy).

### 6.2 Data model (Firestore)

```
users/{uid}:              { displayName, photoURL, fcmTokens: string[], settings }   // = hive
games/{gameId}:           { players: {p0: uid, p1: uid|null, …},     // one key per seat; p0 moves first
                            playerNames: {p0, p1, …}, playerIds: uid[],
                            options: { rulesetId, dictionaryId, timeControl,
                                       invalidWords, maxPlayers },
                            status: 'open'|'active'|'finished',
                            inviteCode?, challenge?,                  // = hive semantics
                            maxPlayers?, roster?, invited?, declined?, turnOrder?,
                                                                      // 3+ ONLY: the pre-start guest list
                                                                      // (§2.3). Its presence is what makes a
                                                                      // game a 3+ game; a 2-seat doc has none
                                                                      // of these and `players` from creation
                            result?: 'p0'|'p1'|'draw',                // winning seat key, or a shared top
                            standings?: [{seats: seatKey[]}],         // every placing, best-first; a placing is a
                                                                      // MAP because Firestore forbids array-in-array
                            endedBy?: 'played-out'|'scoreless'|'last-standing'|'resign'|'timeout',
                            toMove: seatKey, moveCount,
                            scores: {p0, p1, …}, bagCount, rackCounts: {p0, p1, …},
                            lastPlay?: {by, word, score},             // lobby cards + push copy
                            rematchOf?, rematchGameId?,
                            timeControl?: {days: 1|3|7} | null,
                            deadlineAt?, deadlineWarnedAt?,
                            updatedAt, createdAt,
                            public: string }                          // serialized public state (fast load)
games/{gameId}/moves/{n}: { n, kind: 'play'|'phoney'|'exchange'|'pass'|'resign'|'timeout',
                            play?: { placements: [{row, col, letter, isBlank}],
                                     words: [{word, score}], score, bingo },
                            exchanged?: number,                       // count ONLY — letters are private
                            phoney?: { words: string[] },             // the words a refused play formed —
                                                                      // public (§3.3); no placements, no score
                            by: uid, at }
games/{gameId}/racks/{uid}: { tiles: string, n: number }              // e.g. "AEINRT?" — owner-read only;
                                                                      // n = move count this rack is current for
                                                                      // (client refill reconciliation)
games/{gameId}/private/bag: { order: string, drawn: number,           // NO client read, ever
                              state: string,                          // serialized FULL GameState — submitMove's fast path,
                                                                      // regression-checked against order+log+events replay
                              events: [{n, returned, reshuffled}] }   // exchange re-shuffles (§3.3 replay)
invites/{code}:           { gameId, createdBy, hostName, hostSeat?, options, expiresAt,
                            preview? }   // 3+: {hostName, names, filled, maxPlayers} — UID-FREE,
                                         // because anyone signed in holding the code may read this doc
```

- Security rules: game docs + moves readable by the seated players — and, before
  a 3+ game starts, by everyone on its guest list, since `playerIds` carries the
  roster plus anyone still holding an invitation (a decline drops both); `racks/{uid}`
  readable only when `request.auth.uid == uid`; `private/*` readable by **no one**;
  all writes through callables except your own `users/{uid}`. **Rules tests assert
  each boundary, including the negative cases** (opponent rack read denied, bag read
  denied) — this is a security invariant, not a convention (§10).
- Lobby query identical to hive (`playerIds array-contains` + status, composite
  index committed); grouping client-side.
- The `public` snapshot is the same denormalized-cache idea as hive's `state`
  field, regression-checked against server-side replay in tests.

### 6.3 Game API (server-authoritative callables)

| Callable | Delta vs hive |
|---|---|
| `createGame(options, seat)` | seat = `me / them / random` (turn order, not color). At two seats it shuffles + persists the bag and deals both racks; at 3+ it creates a **guest list** instead and the deal waits for `startGame` (§2.3) |
| `joinGame(code)` / `cancelGame` / `challengeUser` / `respondChallenge` / `rematch` | ported from `@parlor/server` — semantics identical to hive §5.3 (challenge = open game addressed to a past opponent; rematch links + rotates who starts). At 3+, `joinGame` appends to the roster and auto-starts once it is full, and `cancelGame` is host-only |
| `respondInvite` / `invitePlayers` / `leaveGame` *(3+ only)* | answer an invitation (a decline moves a name, never deletes), recruit more names, or take your own off the list. Invitees are reachable under the same rule as `challengeUser`: only people you have played. Pushes fan out to the table — `invited`, `player-joined`, `game-started` — never to the actor, and never for a decline |
| `startGame(gameId, expectedRoster, turnOrder)` *(3+ only)* | host-only **start early** from `min`. `expectedRoster` guards it exactly as `submitMove`'s `expectedMoveCount` does, so a last-second joiner is never silently left out. Resolves the order, deals every rack, flips to `active` |
| `setTurnOrder(gameId, turnOrder)` *(3+ only)* | host-only, persisted **before** the start so every player sees the arrangement live |
| `submitMove(gameId, expectedMoveCount, move)` | `move` is the typed JSON `Move` (§2.4). Server reconstructs full state (public log + private doc), asserts turn + concurrency guard, runs `applyMove` (full verdict pipeline incl. dictionary) **under the game's own `invalidWords`**, draws refill, writes: move doc + game doc (incl. `public`, counts, `lastPlay`, deadline) + caller's rack doc + private bag doc — one transaction — then pushes to the opponent. A phoney takes the same path: it is a legal move, so it commits, but writes `kind:'phoney'` with the refused words (no placements, no score), clears `lastPlay`, and pushes copy naming what was tried |
| `resign(gameId)` | = hive at two seats. At 3+ it is a **withdrawal** (§2.1): score frozen, rack back to the bag and re-shuffled, turn order skips the seat, `withdrawn` grows, and the game runs on until one active player is left |
| `forfeitExpired` *(scheduled, hourly)* | = hive (timeouts, expiry-warning pushes, stale-invite cull), with a timeout at 3+ taking the same withdrawal path, plus a cull of **open rooms** whose invite expired while the roster was still below the minimum — a 3+ room outlives its code, so an expired one would otherwise sit unjoinable in every guest's lobby |

Dropped from hive's list: `offerDraw`/`respondDraw` (§2.3).

**Move protocol** = hive's §5.3 protocol with one addition: after the optimistic
local apply, the client's **refill arrives via its rack-doc listener** rather than
being computable locally; the controller holds a "drawing…" placeholder on the rack
until the snapshot lands. Rejection ⇒ rollback + resync, exactly as hive.

### 6.4 Time controls & 6.5 local development

Identical to hive §5.4 (async deadlines v1, real-time clocks post-v1) and §5.5
(emulator suite runs everything; FCM payloads asserted in tests; two-window local
multiplayer against localhost). No lex-specific deltas beyond seeding fixture games
with pinned bag orders.

---

## 7. Frontend

### 7.1 Screens

Same map as hive §6.1 — Landing (themed hero: a board vignette spelling the
wordmark from real tile components), Lobby (challenges / your-turn / waiting /
finished groups; cards show scores + last play: "Sam played QUIZ +68", plus a
move-clock chip on both your-turn and waiting cards — the side-to-move's
deadline, so the opponent's clock is visible too), New game
(opponent chip or invite link; **board picker** — classic/modern with a mini
premium-map preview; **dictionary picker** — labeled with name + word count;
**invalid-words picker** — "Can't be played" / "Cost your turn", the same
two-value toggle shape as turn order and time control, with the rule stated
under whichever is selected; turn order; time control; FR-6..9b), Join (the
game-summary card lists board, dictionary, time control, and your seat — plus a
highlighted chip when invalid words cost the turn, the one setting here that
changes what a turn can cost — the invitee sees the rules before accepting,
FR-10), Settings (notifications, theme, tile skin), and Game (the game menu
restates the chosen options mid-game, the invalid-words rule spelled out in
full — it is where a player goes mid-game to ask what happens if they're
wrong, and so also where "start one set up differently" is offered).

**Hot-seat setup** (`/game/local/new`) is the one-device twin of the New game
screen: the same board / dictionary / invalid-words pickers (literally the same
components — `optionPickers`, so the two forms cannot describe a rule
differently), minus the two settings one device cannot honour (turn order — p0
always starts; the async clock — there is nobody to wait for). `/game/local`
resumes a stored game if there is one and shows this form if there isn't, so
the very first hot-seat game is configured rather than assumed. This is also
what makes the options exercisable in a PR preview, which deploys the static
hot-seat build alone.

Game-screen deltas: player bars carry **scores** (players shown by first name —
falling back to first + last initial, then full name, only as far as needed to
tell them apart — so long names never wrap the bar) and a bag-count chip, and
the side-to-move seat carries the **live move-clock** when the game has a time
control; the hand tray
is the **rack** (7 slots, drag-reorder, shuffle button); a **score sheet** drawer
replaces the move list (per-turn word + score + running totals); actions are
**Play / Recall / Exchange / Pass / Resign**; while `status:'open'` the same
waiting-screen treatment as hive (board withheld, invite re-shareable).

At **three or four players** the open game is a **Game room** instead
(`@parlor/web/lobby-ui`): the guest list, the always-live invite code, the host's
turn-order picker — persisted, so everyone sees the arrangement rather than only
the host — and a Start control that confirms an early start by **naming who is
being left out**. Invitees get an `InvitationReceived` screen, and a full room
answers a good code with "this game is full", not "invalid invite". The two-seat
screens (`WaitingForOpponent`, `InviteLinkView`, `ChallengeReceived`) are
untouched — the 3+ surfaces are strictly additive (DECISIONS 2026-08-28).

### 7.2 Board rendering & interaction (the UX core)

**DOM/CSS grid, not SVG** — a deliberate departure from hive §6.2, same goals:
crisp at any DPI, per-cell pointer events, CSS transitions, DOM-assertable in e2e.
Hive needed SVG for hex geometry and vector glyph art; lex tiles are **typography on
squares** (letter + point index), which DOM does better, and grid hit-testing is one
subtraction + division against the viewport transform — no geometric rounding at
all. The board renders `rows × cols` from the `BoardLayout` (§2.2); premium cells
are colored *and labeled* (DL/TL/DW/TW) so color is never the only signal.

- **Viewport:** the whole board auto-fits the screen (15 cols ≈ 25px cells on a
  phone — readable for orientation, not placement); **pinch/wheel zoom + pan**
  with the hive `BoardViewport` math ported to a CSS transform, including hive's
  hard-won pinch containment (gesture-event swallowing, touch-action pinning).
  Double-tap zooms to placement scale centered on the tap; a recenter/fit button
  matches hive's.
- **Interaction — drag with tap-tap fallback**, one controller state machine, both
  frontends (hive §6.2 model):
  1. *Idle:* rack tiles are draggable/selectable and can be staged onto the board
     — **on or off turn**, so you can lay out a planned play while the opponent
     moves. Only *committing* (Play/Exchange/Pass) is turn-gated. When the
     opponent's move lands, the whole staged plan is recalled to the rack (a new
     game state clears `pending`), so a tile on a cell they just filled never
     lingers.
  2. *Drag a rack tile* over the board: the hovered cell highlights; empty cells
     only. Drop ⇒ the tile becomes a **pending placement** — visually lifted, gold
     edge, distinct from committed tiles in both themes. Drop off-board ⇒ returns
     to rack. Tap-tap: tap a rack tile, tap an empty cell.
  3. Pending tiles are freely movable/returnable (drag back, tap to bounce back,
     **Recall** returns all). Dropping a blank opens the letter-picker sheet.
  4. As placements change, the **live preview card** updates: ONE small panel
     listing every formed word (word + points, ✓/✗ from the local dictionary),
     the bingo line, and the play's total. It lives in *screen* space beside the
     viewport — a readable size at every zoom — and auto-parks in the spot
     around the play that hides the fewest letters (falling back to a clear
     corner of the view on a crowded board), always on screen. That spot is the
     empty space beside the play — where your next tile goes — so the card is
     **click-through**: only its grip takes pointer events, and the transient
     geometry hint has no grip at all. Drag the grip (or arrow-key it) to park
     the card; a parked spot is kept until it would cover a new staged word.
     A word that fails the dictionary is the card's loudest state, not a
     footnote: red border, the doomed total struck through, that word's row
     filled red, its cells ringed on the board (dashed red, ≠ pending gold /
     last-play green). Color and weight only — the sentence naming the word
     rides the disabled Play button (title + a11y tree), not the card, which
     has no room to narrate what it already shows. Illegal geometry replaces
     the list with its reason.
     Play is enabled only when `checkPlay` passes and all words are valid —
     pressing it submits optimistically (§6.3).
     **Where invalid words cost the turn (§2.3) the verdict column is simply
     gone:** no mark on any row, no row filled, no total struck through, no cell
     ringed, and Play is live for any legal placement. The row is the word and
     its score, full stop. (The controller models this as `valid: null` —
     *withheld*, a third state deliberately distinct from `false`, so no surface
     can render "not told" as "rejected"; it survives in the DOM as
     `data-valid="unknown"` for the tests, but is not drawn.) An earlier build
     kept a "—" in the mark's slot and a "not checked" tag in the header, on the
     theory that a blank column reads as a broken check; in play it read as
     clutter restating the setting the player had just chosen, so both were cut.
     The verdict then arrives *after* the commit, as a **phoney beat**: a small
     dismissible dialog naming the refused word(s) and stating the cost. It is
     blocking rather than a toast because a lost turn that leaves the board
     unchanged is indistinguishable from a bug if it isn't stated. In hot-seat
     it renders *above* the pass-device interstitial (§7.3) rather than
     deferring to it or replacing it: deferring loses the news behind an opaque
     screen a frame after it appears, and replacing it would expose the
     INCOMING player's rack behind the dialog — the phoney has already spent
     the turn. On top, the interstitial stays the thing hiding the rack and
     doubles as the beat's backdrop. It is raised only on the mover's own
     commit, never on replay, resume, or a synced remote move.
  5. **Exchange** flips the rack into multi-select (tiles dim/raise on tap) with a
     confirm bar ("Exchange 3 tiles — costs your turn"); disabled with a reason
     when the bag < 7. **Pass** confirms via dialog.
- **Remote plays animate in** tile-by-tile along the word; the opponent's last play
  stays highlighted (hive's last-move convention, green edge — distinct from the
  pending gold) and its score badge sits in the first empty cell beside the word
  — the word's full span, bridged letters included, never underneath one.
  **Tapping the badge expands it** into the words that play formed and what each
  scored (a popover, dismissed by a tap anywhere — the score sheet has the same
  facts, but the question is asked while looking at the play). The badge and the
  card's grip both go inert while a rack tile is armed, so board chrome can
  never eat the tap that places a tile. Both step aside while you have
  tiles staged so they never compete with the placement emphasis.
  **A tap on the board tucks the badge away and another tap brings it back**
  (the highlight stays): an empty cell beside the word can still be the square
  you want to read, and staging a tile shouldn't be the only way out. A new
  play always restores it; taps taken while tiles are staged don't count, so
  a recall never comes back to a missing badge.
- Drag is raw pointer events, no dnd library — hive decision §9.8's reasoning
  transfers wholesale (touch first, transform-aware hit-testing, controller-testable
  without synthetic events).

### 7.3 Hot-seat privacy (pass-device mode)

Hot-seat (M3, `LocalTransport`) adds the one thing hive never needed: **racks are
secret between seats on one device**. After each turn ends, a full-screen
interstitial ("Hand the device to Sam — tap to see your rack") hides both racks
until tapped. The gallery captures it; the e2e drives through it.

### 7.4 End of game & victory screens

Hive §6.3's structure ported: a brief board beat (camera settles on the final play;
skip on resign/timeout), then the result overlay — headline + reason ("Played out!",
"Sam resigned", "Won on time", "Draw — 212 apiece", "Ada and Kai tie for the win"),
the **final standings podium**, stats (moves, biggest word, duration), and
Rematch / View board / Back to lobby. Finished games reopen read-only with the
score sheet, same as hive.

The podium is one row per player in the order `GameResult.standings` gives —
winner first at every seat count, tied seats sharing a placing — each row
carrying placing, name, final score and its end-adjustment line item ("+9 from
Sam's rack" / "−4 unplayed"). It **renders that order and never re-ranks it**:
withdrawn players sit below everyone who finished however high their frozen
score, each saying so on its own row, so the ranking rule is visible where it
bites. Once the game is over the player bar's rail reads by placing too. At 3+
seats Rematch names everyone it pulls back in (the server rotates the order by
one, so the old second seat opens) and offers "Not this time" — a local
dismissal of the offer, not a server-side decline.

### 7.5 Art direction & 7.6 state management

- MUI chrome + custom theme, light/dark from day one — hive §6.4's system with a
  fraction of the asset burden: no glyph menagerie, just the **tile** (letter +
  point index, CSS-variable skin: classic cream / walnut / high-contrast — the
  institutionalized bear-mode seam), premium-cell palette, wordmark, and a small
  sprite sheet for motifs (star, result crown). PWA icons exported from the tile
  wordmark by the ported build script.
- State management identical to hive §6.5: TanStack Query + Firestore listener
  hooks; `GameController` as a plain class + `useSyncExternalStore`; no Redux.

---

## 8. PWA & notifications

Hive §7 applies nearly verbatim: `vite-plugin-pwa` (injectManifest, per hive's M5
learnings), offline read-only lobby via Firestore persistent cache, FCM Web Push
with data-only payloads + SW display + the **push-sync postMessage resync** fix,
iOS install coach mark, document-title and Badging API counts. Push triggers:
opponent played (copy includes word + score), game joined, challenge
received/accepted/declined, rematch offered, game over, deadline warning.

**Website integration:** lex becomes the second **external-link card** on
zackmfleischman.com's apps grid — the card variant hive's T6.6 builds (`externalUrl`
on `IApp`). By lex M6 that variant exists, so lex's PR is just a `store.yaml` entry
+ thumbnail (exported by the icon script); if hive hasn't landed T6.6 yet, lex M6
inherits that task as specified in hive DESIGN §7. Production domain:
**`lex.zackmfleischman.com`** via Firebase Hosting, same DNS/TLS flow as hive.

---

## 9. Decisions made on ambiguities (override any of these)

1. **Strict dictionary, no challenges, v1** — Words-with-Friends convention; right
   for casual friends-play. Challenge-mode is a post-v1 ruleset flag; the split
   verdict pipeline (§5.2) already accommodates it.
2. **Two public-domain word lists, chosen per game** — `enable1` (tournament-ish)
   and `2of12inf` (everyday words); licensing-clean, and the picker is real from
   day one. NWL/SOWPODS are registry entries away if the owner obtains them.
3. **Two players in v1, N-player engine** — lobby/invite flows are the 2-seat
   part; the engine is seat-indexed arrays from day one.
4. **No draw offers** — score ties are the natural draw; hive's offer flow would be
   dead weight. Resign stays.
5. **Typed JSON moves on the wire, GCG for fixtures/records** — blanks make GCG
   strings a lossy wire format; JSON is unambiguous and equals the storage format.
6. **Bag pre-shuffled at create + re-shuffled on exchange, server-side crypto RNG,
   engine fully deterministic** — hive's "randomness lives at the edges" rule
   adapted to hidden information (§3.3).
7. **Scoreless-turn limit = 6** (standard), counting passes, exchanges, and 0-point
   plays; prevents zombie async games the way hive's repetition rule does.
8. **DOM grid over SVG** for the board (§7.2) — typography-heavy tiles, trivial
   hit-testing; hive's viewport/pinch math ports anyway.
9. **The shared platform is the repo-level `parlor/` workspace from day one**
   (owner decision, superseding the earlier defer-extraction plan) — lex is its
   only consumer to start; hive migrates later. Mechanics + rationale in §4.
10. **Rematch swaps who starts**; turn order at create is me/them/random
    (default random) — the seat analog of hive's color pick.
11. **Same doc policy, same enforcement** as hive (IMPLEMENTATION §7): closed doc
    set, line budgets, DECISIONS.md as the only growing file, `check-docs.mjs`
    wired into typecheck.
12. **Named LEX** (owner-confirmed); nothing in the architecture depends on it.
13. **Board layout and dictionary are per-game options in v1** (owner
    requirement): v1 ships `classic` + `modern` layouts and both word lists;
    `dictionaryId` lives in `GameOptions`, not inside the `Ruleset`, so any
    board pairs with any list.

---

## 10. Testing strategy

Hive §8's layer table carries over with these substitutions:

| Layer | Lex-specific content |
|---|---|
| Engine unit | checkPlay geometry cases, scoring fixtures (premium stacking, cross-words, bingo, blanks), end adjustments, exchange/pass legality, GCG round-trips — the pinned list in IMPLEMENTATION §6 |
| Engine property | random legal games over injected bag orders: tile conservation across board+racks+bag, apply-never-throws, serialize/replay identity, **`playerView` never leaks hidden info**, scoreless-run bookkeeping, termination |
| Dictionary | DAWG lookup ≡ reference word-set on both full lists + fuzzed negatives; content-hash pins; registry metadata matches vendored files |
| Controller | pending-placement model, optimistic apply + rack-refill merge + rejection rollback, exchange selection, drag/tap state machine |
| Functions + rules | submitMove happy/illegal/concurrency paths, **rack/bag read-denial rules tests**, exchange privacy (public doc has count only), draw correctness, forfeit sweep |
| UI components | board/rack render from fixed states, the preview card + its placement math, blank picker, pass-device flow |
| e2e (Playwright + emulators) | two-browser full game: create → invite → join → plays both ways → exchange → bingo → resign → rematch; reload-mid-game resume |

Self-validation harness (gallery, `validate:visual`/`ux`, mandatory screenshot
review against `e2e/visual-checklist.md`) is inherited as-is — it's ported code,
not reinvented process. Full harness spec and build protocol: IMPLEMENTATION.md.

---

## 11. Milestone map

Every milestone through **M7** has shipped. The per-task breakdown, the gate for
each, and the frozen engine API live in [IMPLEMENTATION.md](./IMPLEMENTATION.md),
which collapses each shipped milestone to a SHIPPED entry in
[DECISIONS.md](./DECISIONS.md) — that pair is the record, so it is not restated
here. In outline: M0 scaffolded both workspaces, M1 the engine, M2 the
dictionaries, M3 the local/hot-seat UI and the whole validation harness, M4 the
multiplayer backend, M5 PWA + push + async deadlines, M6 the polish-and-ship
pass, and M7 seats three and four players.

**v1.1 candidates:** real-time clocks · keyboard entry on desktop · game
chat/emotes · AI opponent (`@lex/ai`, DAWG move gen) · analysis/best-play review ·
hive's migration onto `parlor/` · `.gcg` export · more rulesets/word lists
(11×11 quick board; NWL/SOWPODS if licensed).

---

## 12. Risks & mitigations

- **Scoring/legality edge cases** (premium stacking, blanks, endgame math) → the
  pinned fixture list (IMPLEMENTATION §6) + property tests; engine frozen behind
  its API like hive's.
- **Hidden-info leaks** → three-tier schema with *negative* rules tests; playerView
  leak property test; exchange letters never leave the server.
- **Client/server dictionary skew** → single package, id + content hash asserted on
  both sides.
- **Board readability at phone width** → fit-view is for orientation, placement
  happens zoomed; double-tap zoom; visual-checklist items pin legibility at both
  scales.
- **IP concerns if ever public** → layout/tileset/name are all data/config by
  requirement (§2.2); swapping to original values is a one-file change.
- **Divergence from hive's originals in `parlor/`** → provenance headers make
  fixes greppable to their twin (§4); goes away when hive migrates onto parlor.
- **Cross-workspace linking friction (parlor ↔ lex)** → one documented wiring
  (IMPLEMENTATION §1) with the vite/pnpm gotchas pre-solved in §8's lessons.
- **iOS push quirks, Firestore costs** → hive's mitigations inherited (coach mark,
  in-app badges; per-game docs).
