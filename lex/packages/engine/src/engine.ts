// applyMove, result, end-game adjustments (DESIGN §5.2). The full verdict
// pipeline runs here for plays; exchange/pass legality is enforced; refills
// draw deterministically from the bag front. Exchanged tiles are appended to
// the bag END (after the refill draw) — re-randomizing the remainder is the
// transport/server's job, recorded as a re-shuffle event (DESIGN §3.3).
//
// Stage 3 (the dictionary) is where a game's `invalidWords` setting bites
// (§2.2). Under 'blocked' (the default) an invalid word is not a move at all and
// applyMove throws; under 'costs-turn' it IS a move — a **phoney** — that scores
// nothing and spends the turn. Same pipeline, same verdict; only the consequence
// differs, so the second setting adds no new rule, just a second thing to do
// with `invalid`.
import { extractWords, type Placement } from './board.js';
import { RULESETS, type Ruleset, type Seat, type TileFace } from './ruleset.js';
import { activeSeats, draw, freezeState, isWithdrawn, nextActiveSeat, type GameState } from './state.js';
import { checkPlay, type WordScore } from './validate.js';
import { scorePlay } from './score.js';

export interface Dictionary {
  id: string;
  has(word: string): boolean;
}

export type Move =
  | { type: 'play'; placements: readonly Placement[] }
  | { type: 'exchange'; tiles: readonly TileFace[] }
  | { type: 'pass' };

/** What a game does with a play whose words aren't all in the dictionary
 * (DESIGN §2.3) — a per-game setting, picked at creation like the dictionary
 * itself:
 * - `'blocked'` — it is not a move at all: applyMove throws, naming the words.
 * - `'costs-turn'` — it is a **phoney**: the tiles come back, nothing scores,
 *   and the turn is spent.
 */
export type InvalidWordRule = 'blocked' | 'costs-turn';

/** Per-game settings that change what a move MEANS rather than what the board
 * is — pinned in GameOptions, not the Ruleset, so any board pairs with any of
 * them (DESIGN §2.2). Absent ⇒ the defaults. */
export interface MoveOptions {
  /** Default `'blocked'`. */
  invalidWords?: InvalidWordRule;
}

/** Stage 3 of the verdict pipeline (§5.2) on its own: which of a candidate
 * play's words the dictionary rejects, in the order the play forms them.
 * Empty ⇒ the play scores. Exported because 'costs-turn' games need this
 * verdict AFTER the commit (to record the phoney) as well as before it. */
export function rejectedWords(words: readonly WordScore[], dict: Dictionary): readonly string[] {
  return words.filter((w) => !dict.has(w.word)).map((w) => w.word);
}

export class IllegalMoveError extends Error {
  readonly reason: string;
  readonly words: readonly string[] | undefined;
  constructor(reason: string, message?: string, words?: readonly string[]) {
    super(message ?? reason);
    this.name = 'IllegalMoveError';
    this.reason = reason;
    this.words = words;
  }
}

export type GameResult =
  | { status: 'ongoing' }
  | { status: 'finished'; winner: Seat | 'draw'; by: 'played-out' | 'scoreless'; finalScores: readonly number[] };

export function rulesetOf(state: GameState): Ruleset {
  const ruleset = RULESETS[state.rulesetId];
  if (!ruleset) throw new IllegalMoveError('unknown-ruleset', `unknown ruleset '${state.rulesetId}'`);
  return ruleset;
}

/** scorePlay against a state's own board + ruleset (gcg + fixtures). */
export function scorePlayOf(state: GameState, placements: readonly Placement[]): ReturnType<typeof scorePlay> {
  return scorePlay(state.board, placements, rulesetOf(state));
}

function rackSum(rack: readonly TileFace[], ruleset: Ruleset): number {
  return rack.reduce((sum, face) => sum + (ruleset.tiles.points[face] ?? 0), 0);
}

/** Which board ending, if any, does this state sit in? Played-out wins. */
function endedBy(state: GameState, ruleset: Ruleset): 'played-out' | 'scoreless' | null {
  // A withdrawn seat's rack is empty by construction (it went back to the
  // bag), so the played-out test looks at ACTIVE seats only — otherwise any
  // withdrawal would end the game on the spot.
  if (state.bag.length === 0 && activeSeats(state).some((seat) => state.racks[seat]!.length === 0)) return 'played-out';
  if (state.scorelessRun >= ruleset.scorelessLimit) return 'scoreless';
  return null;
}

/** Board outcomes only — resign/timeout live in the game doc (DESIGN §6.2). */
export function result(state: GameState): GameResult {
  const ruleset = rulesetOf(state);
  const by = endedBy(state, ruleset);
  if (!by) return { status: 'ongoing' };
  const top = Math.max(...state.scores);
  const winners = state.scores.filter((score) => score === top);
  const winner: Seat | 'draw' = winners.length === 1 ? state.scores.indexOf(top) : 'draw';
  return { status: 'finished', winner, by, finalScores: state.scores };
}

/** The §2.1 end adjustments, applied by the terminal applyMove. */
function finalizeIfEnded(state: GameState, ruleset: Ruleset): GameState {
  const by = endedBy(state, ruleset);
  if (by === 'played-out') {
    const finisher = activeSeats(state).find((seat) => state.racks[seat]!.length === 0)!;
    const scores = [...state.scores];
    let gained = 0;
    state.racks.forEach((rack, seat) => {
      if (seat === finisher || isWithdrawn(state, seat)) return;
      const stranded = rackSum(rack, ruleset);
      scores[seat]! -= stranded;
      gained += stranded;
    });
    scores[finisher]! += gained;
    return freezeState({ ...state, scores });
  }
  if (by === 'scoreless') {
    const scores = state.scores.map((score, seat) => score - rackSum(state.racks[seat]!, ruleset));
    return freezeState({ ...state, scores });
  }
  return state;
}

/** Remove `faces` from `rack` as a multiset; throws if any face is missing. */
function removeFromRack(rack: readonly TileFace[], faces: readonly TileFace[]): TileFace[] {
  const remaining = [...rack];
  for (const face of faces) {
    const index = remaining.indexOf(face);
    if (index === -1) throw new IllegalMoveError('not-your-tiles', `rack does not hold '${face}'`);
    remaining.splice(index, 1);
  }
  return remaining;
}

function advance(state: GameState, changes: Partial<GameState>): GameState {
  const next: GameState = { ...state, ...changes, moveCount: state.moveCount + 1 };
  return freezeState({ ...next, toMove: nextActiveSeat(next, state.toMove) });
}

/**
 * A seat leaves the game — resign or timeout at 3+ seats (DESIGN §2.1). Their
 * score freezes and their rack returns to the bag END, exactly as an exchange
 * does, for the server to re-shuffle (DESIGN §3.3); the turn passes on if it
 * was theirs. Withdrawal is not a move, but it does advance `moveCount`: it
 * writes a log entry and must move the optimistic-concurrency cursor with it.
 */
export function withdraw(state: GameState, seat: Seat): GameState {
  const rack = state.racks[seat];
  if (!Number.isInteger(seat) || rack === undefined) {
    throw new IllegalMoveError('no-such-seat', `seat ${seat} out of range (game has ${state.racks.length} seats)`);
  }
  if (isWithdrawn(state, seat)) {
    throw new IllegalMoveError('already-withdrawn', `seat ${seat} has already withdrawn`);
  }
  const ruleset = rulesetOf(state);
  if (endedBy(state, ruleset)) {
    throw new IllegalMoveError('game-over', 'game-over: no withdrawal from a finished game');
  }
  const next: GameState = {
    ...state,
    racks: state.racks.map((r, i) => (i === seat ? [] : r)),
    bag: [...state.bag, ...rack], // server re-shuffles, as after an exchange (§3.3)
    withdrawn: [...state.withdrawn, seat].sort((a, b) => a - b),
    moveCount: state.moveCount + 1,
  };
  return freezeState({ ...next, toMove: state.toMove === seat ? nextActiveSeat(next, seat) : state.toMove });
}

function applyPlay(
  state: GameState,
  placements: readonly Placement[],
  dict: Dictionary,
  ruleset: Ruleset,
  invalidWords: InvalidWordRule,
): GameState {
  const seat = state.toMove;
  const rack = state.racks[seat]!;

  // Geometry and rack legality are NOT affected by the setting: a play that
  // isn't a play (off-board, not your tiles, disconnected) is still no move at
  // all. Only the dictionary verdict below changes meaning.
  const check = checkPlay(state.board, rack, placements, ruleset);
  if (!check.ok) throw new IllegalMoveError(check.reason);

  const invalid = rejectedWords(check.words, dict);
  if (invalid.length > 0) {
    if (invalidWords === 'blocked') {
      throw new IllegalMoveError('invalid-word', `not in dictionary '${dict.id}': ${invalid.join(', ')}`, invalid);
    }
    // Phoney: the tiles come straight back. Nothing about the board, the rack
    // or the bag moves — the ONLY effects are the turn passing and the
    // scoreless run advancing, so six phoneys in a row end the game exactly as
    // six passes would (§2.1). Deterministic on replay: same board, same rack,
    // same dictionary ⇒ same verdict, so no phoney marker has to be logged.
    return advance(state, { scorelessRun: state.scorelessRun + 1 });
  }

  const { total } = scorePlay(state.board, placements, ruleset);
  const { overlay } = extractWords(state.board, placements);

  const remaining = removeFromRack(rack, placements.map((p): TileFace => (p.isBlank ? '?' : p.letter)));
  const { drawn, rest } = draw(state.bag, placements.length);

  const racks = state.racks.map((r, i) => (i === seat ? [...remaining, ...drawn] : r));
  const scores = state.scores.map((s, i) => (i === seat ? s + total : s));

  return advance(state, {
    board: overlay,
    racks,
    bag: rest,
    scores,
    scorelessRun: total > 0 ? 0 : state.scorelessRun + 1,
  });
}

function applyExchange(state: GameState, tiles: readonly TileFace[], ruleset: Ruleset): GameState {
  if (tiles.length === 0) {
    throw new IllegalMoveError('empty-exchange', 'exchange at least one tile (or pass)');
  }
  if (state.bag.length < ruleset.exchangeMinBag) {
    throw new IllegalMoveError('exchange-bag-low', `exchange needs ≥ ${ruleset.exchangeMinBag} tiles in the bag (${state.bag.length} left)`);
  }
  const seat = state.toMove;
  const remaining = removeFromRack(state.racks[seat]!, tiles);
  const { drawn, rest } = draw(state.bag, tiles.length);
  const racks = state.racks.map((r, i) => (i === seat ? [...remaining, ...drawn] : r));

  return advance(state, {
    racks,
    bag: [...rest, ...tiles], // returned after the draw; server re-shuffles (§3.3)
    scorelessRun: state.scorelessRun + 1,
  });
}

export function applyMove(
  state: GameState,
  move: Move,
  dict: Dictionary,
  options: MoveOptions = {},
): GameState {
  const ruleset = rulesetOf(state);
  if (endedBy(state, ruleset)) {
    throw new IllegalMoveError('game-over', 'game-over: no further moves on a finished game');
  }
  let next: GameState;
  switch (move.type) {
    case 'play':
      next = applyPlay(state, move.placements, dict, ruleset, options.invalidWords ?? 'blocked');
      break;
    case 'exchange':
      next = applyExchange(state, move.tiles, ruleset);
      break;
    case 'pass':
      next = advance(state, { scorelessRun: state.scorelessRun + 1 });
      break;
  }
  return finalizeIfEnded(next, ruleset);
}
