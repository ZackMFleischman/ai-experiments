// GameState (full) / PlayerView (projected), bag & draw (DESIGN §5.1, §3.3).
// The engine never shuffles: bagOrder is injected, the bag front is the next
// draw, and everything downstream is deterministic.
import type { PlacedTile } from './board.js';
import { type CellKey, type Ruleset, type Seat, type TileFace } from './ruleset.js';

export interface GameState {
  // FULL state — server/hot-seat only
  readonly rulesetId: string;
  readonly board: ReadonlyMap<CellKey, PlacedTile>;
  readonly racks: ReadonlyArray<readonly TileFace[]>;
  readonly bag: readonly TileFace[]; // front = next draw
  readonly scores: readonly number[];
  readonly toMove: Seat;
  readonly moveCount: number;
  readonly scorelessRun: number;
  readonly withdrawn: readonly Seat[]; // seats that left the game, ascending
}

export interface PlayerView {
  readonly rulesetId: string;
  readonly board: ReadonlyMap<CellKey, PlacedTile>;
  readonly rack: readonly TileFace[]; // own only
  readonly scores: readonly number[];
  readonly bagCount: number;
  readonly rackCounts: readonly number[];
  readonly toMove: Seat;
  readonly moveCount: number;
  readonly scorelessRun: number;
  readonly withdrawn: readonly Seat[]; // public: which seats have left
}

/**
 * The ONLY projection from full state to what one player may know: board,
 * own rack, scores, bag COUNT, rack COUNTS (DESIGN §3.2–§3.3). A property
 * test asserts it never leaks.
 */
export function playerView(state: GameState, seat: Seat): PlayerView {
  const rack = state.racks[seat];
  if (!Number.isInteger(seat) || rack === undefined) {
    throw new Error(`seat ${seat} out of range (game has ${state.racks.length} seats)`);
  }
  return {
    rulesetId: state.rulesetId,
    board: state.board,
    rack,
    scores: state.scores,
    bagCount: state.bag.length,
    rackCounts: state.racks.map((r) => r.length),
    toMove: state.toMove,
    moveCount: state.moveCount,
    scorelessRun: state.scorelessRun,
    withdrawn: state.withdrawn,
  };
}

/** Has `seat` left the game (DESIGN §2.1 withdrawal)? */
export function isWithdrawn(state: GameState, seat: Seat): boolean {
  return state.withdrawn.includes(seat);
}

/** Seats still in the game, in seat order. */
export function activeSeats(state: GameState): Seat[] {
  return state.racks.map((_rack, seat) => seat).filter((seat) => !isWithdrawn(state, seat));
}

/**
 * The next seat after `from` that has not withdrawn, wrapping. Returns `from`
 * itself when it is the only seat left — the caller (T7.2 `endedBy`) ends the
 * game rather than looping.
 */
export function nextActiveSeat(state: GameState, from: Seat): Seat {
  const seats = state.racks.length;
  for (let step = 1; step <= seats; step++) {
    const seat = (from + step) % seats;
    if (!isWithdrawn(state, seat)) return seat;
  }
  return from;
}

/** Draw `n` tiles off the bag front (or all that remain). Pure. */
export function draw(bag: readonly TileFace[], n: number): { drawn: TileFace[]; rest: TileFace[] } {
  return { drawn: bag.slice(0, n), rest: bag.slice(n) };
}

export function freezeState(state: GameState): GameState {
  for (const rack of state.racks) Object.freeze(rack);
  Object.freeze(state.racks);
  Object.freeze(state.bag);
  Object.freeze(state.scores);
  Object.freeze(state.withdrawn);
  return Object.freeze(state);
}

/** Multiset equality between a bag order and the ruleset's tile set. */
function assertPermutation(ruleset: Ruleset, bagOrder: readonly TileFace[]): void {
  const expected = ruleset.tiles.counts;
  const totalTiles = Object.values(expected).reduce((sum, count) => sum + count, 0);
  if (bagOrder.length !== totalTiles) {
    throw new Error(`bagOrder is not a permutation of tile set '${ruleset.tiles.id}': length ${bagOrder.length} ≠ ${totalTiles}`);
  }
  const seen: Record<string, number> = {};
  for (const face of bagOrder) seen[face] = (seen[face] ?? 0) + 1;
  for (const [face, count] of Object.entries(expected)) {
    if ((seen[face] ?? 0) !== count) {
      throw new Error(`bagOrder is not a permutation of tile set '${ruleset.tiles.id}': face '${face}' ×${seen[face] ?? 0} ≠ ×${count}`);
    }
    delete seen[face];
  }
  const alien = Object.keys(seen);
  if (alien.length > 0) {
    throw new Error(`bagOrder is not a permutation of tile set '${ruleset.tiles.id}': unknown face '${alien[0]}'`);
  }
}

/** Validates the permutation and deals `seats` racks in seat order. */
export function initialState(ruleset: Ruleset, bagOrder: readonly TileFace[], seats: number): GameState {
  if (!Number.isInteger(seats) || seats < 2) {
    throw new Error(`seats must be an integer ≥ 2, got ${seats}`);
  }
  assertPermutation(ruleset, bagOrder);
  const racks: TileFace[][] = [];
  let bag: readonly TileFace[] = [...bagOrder];
  for (let seat = 0; seat < seats; seat++) {
    const { drawn, rest } = draw(bag, ruleset.rackSize);
    racks.push(drawn);
    bag = rest;
  }
  return freezeState({
    rulesetId: ruleset.id,
    board: new Map(),
    racks,
    bag,
    scores: racks.map(() => 0),
    toMove: 0,
    moveCount: 0,
    scorelessRun: 0,
    withdrawn: [],
  });
}
