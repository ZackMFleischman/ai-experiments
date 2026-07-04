// applyMove, result, end-game adjustments (DESIGN §5.2). The full verdict
// pipeline runs here for plays; exchange/pass legality is enforced; refills
// draw deterministically from the bag front. Exchanged tiles are appended to
// the bag END (after the refill draw) — re-randomizing the remainder is the
// transport/server's job, recorded as a re-shuffle event (DESIGN §3.3).
import { extractWords, type Placement } from './board.js';
import { RULESETS, type Ruleset, type Seat, type TileFace } from './ruleset.js';
import { draw, freezeState, type GameState } from './state.js';
import { checkPlay } from './validate.js';
import { scorePlay } from './score.js';

export interface Dictionary {
  id: string;
  has(word: string): boolean;
}

export type Move =
  | { type: 'play'; placements: readonly Placement[] }
  | { type: 'exchange'; tiles: readonly TileFace[] }
  | { type: 'pass' };

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

function rackSum(rack: readonly TileFace[], ruleset: Ruleset): number {
  return rack.reduce((sum, face) => sum + (ruleset.tiles.points[face] ?? 0), 0);
}

/** Which board ending, if any, does this state sit in? Played-out wins. */
function endedBy(state: GameState, ruleset: Ruleset): 'played-out' | 'scoreless' | null {
  if (state.bag.length === 0 && state.racks.some((rack) => rack.length === 0)) return 'played-out';
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
    const finisher = state.racks.findIndex((rack) => rack.length === 0);
    const scores = [...state.scores];
    let gained = 0;
    state.racks.forEach((rack, seat) => {
      if (seat === finisher) return;
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
  return freezeState({
    ...state,
    ...changes,
    toMove: (state.toMove + 1) % state.racks.length,
    moveCount: state.moveCount + 1,
  });
}

function applyPlay(state: GameState, placements: readonly Placement[], dict: Dictionary, ruleset: Ruleset): GameState {
  const seat = state.toMove;
  const rack = state.racks[seat]!;

  const check = checkPlay(state.board, rack, placements, ruleset);
  if (!check.ok) throw new IllegalMoveError(check.reason);

  const invalid = check.words.filter((w) => !dict.has(w.word)).map((w) => w.word);
  if (invalid.length > 0) {
    throw new IllegalMoveError('invalid-word', `not in dictionary '${dict.id}': ${invalid.join(', ')}`, invalid);
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

export function applyMove(state: GameState, move: Move, dict: Dictionary): GameState {
  const ruleset = rulesetOf(state);
  if (endedBy(state, ruleset)) {
    throw new IllegalMoveError('game-over', 'game-over: no further moves on a finished game');
  }
  let next: GameState;
  switch (move.type) {
    case 'play':
      next = applyPlay(state, move.placements, dict, ruleset);
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
