// applyMove, result, end-game adjustments (DESIGN §5.2). The full verdict
// pipeline runs here for plays; exchange/pass legality is enforced; refills
// draw deterministically from the bag front. Exchanged tiles are appended to
// the bag END (after the refill draw) — re-randomizing the remainder is the
// transport/server's job, recorded as a re-shuffle event (DESIGN §3.3).
import { extractWords, type Placement } from './board.js';
import { RULESETS, type Ruleset, type TileFace } from './ruleset.js';
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

export function rulesetOf(state: GameState): Ruleset {
  const ruleset = RULESETS[state.rulesetId];
  if (!ruleset) throw new IllegalMoveError('unknown-ruleset', `unknown ruleset '${state.rulesetId}'`);
  return ruleset;
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
  switch (move.type) {
    case 'play':
      return applyPlay(state, move.placements, dict, ruleset);
    case 'exchange':
      return applyExchange(state, move.tiles, ruleset);
    case 'pass':
      return advance(state, { scorelessRun: state.scorelessRun + 1 });
  }
}
