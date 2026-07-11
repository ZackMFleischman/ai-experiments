# Brief — Solitaire (solo)

`node tools/create-app/index.mjs solitaire --kind solo --display "Solitaire"
--tagline "Klondike, quiet and honest." --accent "#365f8c" --port 5240`

**The game.** Klondike draw-one: seven tableau piles, four foundations,
stock/waste. Daily deal by seed (same shuffle for everyone on a local
date, like Sudoku's daily) + random deals. Unlimited undo via SoloSession
(every move is a log entry); win detection + auto-finish when the whole
tableau is face-up and safe.

**Engine.** Pure: deal from `mulberry32(seed)` (Fisher–Yates from
`@parlor/solo`), moves = {flip | draw | move {from,to,count}}, legality
checked in the engine (alternating colors descending; foundations ascend
by suit). Property test: random legal playouts never corrupt the deck (52
cards, each exactly once).

**Feel.** Card stacks as brand-styled tiles (no skeuomorphic deck art);
drag or tap-to-move (tap = smart move to the best target). Stats: games
played/won, win streak by day (StatsStore buckets 'daily'/'random').

**Out of scope.** Draw-three, Vegas scoring, timed scoring, hints.

**Store.** Privacy data-not-collected; $1; category GAMES/Card.
