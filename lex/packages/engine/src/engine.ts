// applyMove, result, end-game adjustments (DESIGN §5.2). The full verdict
// pipeline runs here for plays; exchange/pass legality is enforced; refills
// draw deterministically from the bag front. Exchanged tiles are appended to
// the bag END (after the refill draw) — re-randomizing the remainder is the
// transport/server's job, recorded as a re-shuffle event (DESIGN §3.3).
import { extractWords, type Placement } from './board.js';
import { RULESETS, type Ruleset, type Seat, type TileFace } from './ruleset.js';
import { activeSeats, draw, freezeState, isWithdrawn, nextActiveSeat, type GameState } from './state.js';
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
  | {
      status: 'finished';
      /** Best-first placings; an inner array of 2+ seats is a tie. */
      standings: readonly (readonly Seat[])[];
      by: 'played-out' | 'scoreless' | 'last-standing';
      finalScores: readonly number[];
    };

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

/**
 * Which board ending, if any, does this state sit in? Last-standing outranks
 * played-out, which outranks scoreless. Every test reads ACTIVE seats: a
 * withdrawn seat's rack is empty by construction (it went back to the bag),
 * so counting it would end the game the instant anyone withdrew.
 */
function endedBy(state: GameState, ruleset: Ruleset): 'played-out' | 'scoreless' | 'last-standing' | null {
  const active = activeSeats(state);
  if (state.withdrawn.length > 0 && active.length <= 1) return 'last-standing';
  if (state.bag.length === 0 && active.some((seat) => state.racks[seat]!.length === 0)) return 'played-out';
  // The limit is per ROUND — one full circuit of the seats still playing — so
  // it is 6 at two seats, exactly as before M7 (DECISIONS 2026-08-28).
  if (state.scorelessRun >= ruleset.scorelessRounds * active.length) return 'scoreless';
  return null;
}

/**
 * Best-first placings. Everyone who finished ranks above everyone who
 * withdrew; inside each block, by score, tied seats sharing a placing
 * (DECISIONS 2026-08-28 — ranking purely by score would make resigning while
 * ahead a viable way to bank a placing).
 */
function placings(state: GameState): readonly (readonly Seat[])[] {
  const byScore = (seats: readonly Seat[]): (readonly Seat[])[] => {
    const groups = new Map<number, Seat[]>();
    for (const seat of seats) {
      const tied = groups.get(state.scores[seat]!);
      if (tied) tied.push(seat);
      else groups.set(state.scores[seat]!, [seat]);
    }
    return [...groups.keys()].sort((a, b) => b - a).map((score) => Object.freeze(groups.get(score)!));
  };
  return Object.freeze([...byScore(activeSeats(state)), ...byScore(state.withdrawn)]);
}

/** Board outcomes only — resign/timeout live in the game doc (DESIGN §6.2). */
export function result(state: GameState): GameResult {
  const ruleset = rulesetOf(state);
  const by = endedBy(state, ruleset);
  if (!by) return { status: 'ongoing' };
  return { status: 'finished', standings: placings(state), by, finalScores: state.scores };
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
    // A withdrawn seat's score is frozen — it holds no tiles to deduct.
    const scores = state.scores.map((score, seat) => (isWithdrawn(state, seat) ? score : score - rackSum(state.racks[seat]!, ruleset)));
    return freezeState({ ...state, scores });
  }
  // 'last-standing' adjusts nothing: the survivor's tiles never came off a
  // natural ending, and every other rack is already back in the bag.
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
  const moved = freezeState({ ...next, toMove: state.toMove === seat ? nextActiveSeat(next, seat) : state.toMove });
  // Losing an active seat shrinks the scoreless limit, and the last withdrawal
  // ends the game outright — either way the ending must be finalized here.
  return finalizeIfEnded(moved, ruleset);
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
