// T1.10 / T7.3: property suite — the §6 invariants over random legal games
// driven by fc-shuffled bag orders and an fc choice stream. Every game is
// played at an fc-chosen seat count (2, 3 or 4), and the random policy also
// WITHDRAWS seats (resign/timeout, §2.1) while more than two remain, so the
// N-player rotation, the per-round scoreless limit and the withdrawal
// invariants (frozen scores, turn queue, standings) all get exercised. Runs
// LEX_PROP_GAMES games (default 30; validate:m1 runs 1000). The fc seed is
// pinned in CI (§8.2); a macrotask yield between games keeps vitest's worker
// RPC alive.
//
// Invariant 5 note: engine-level replay is exact from bagOrder + the action
// list alone because applyMove's exchange and withdraw's rack-return are both
// deterministic (returned tiles appended); server re-shuffle EVENTS are
// transport state and are covered by T4.5.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  RULESETS,
  applyMove,
  deserializeState,
  initialState,
  parseGcg,
  parsePublic,
  playerView,
  result,
  scorePlay,
  serializePublic,
  serializeState,
  toGcg,
  turnQueue,
  withdraw,
  type GameState,
  type Move,
  type Ruleset,
  type Seat,
  type TileFace,
} from '../src/index.js';
import { canonicalBagOrder, enumerateCandidatePlays, stubDict } from './helpers.js';

const GAMES = Number(process.env.LEX_PROP_GAMES ?? 30);
const SEED = process.env.CI ? 20260704 : undefined;
const PLY_CAP = 400;
/** 1-in-N chance a ply withdraws the seat to move instead of moving. */
const WITHDRAW_ODDS = 40;

const dict = stubDict();

/** The recorded history: withdrawals interleave with moves (invariant 5). */
type Action = { kind: 'move'; move: Move } | { kind: 'withdraw'; seat: Seat };

function tileCensus(faces: Iterable<TileFace>): Record<string, number> {
  const census: Record<string, number> = {};
  for (const face of faces) census[face] = (census[face] ?? 0) + 1;
  return census;
}

/** Seats still in the game, ascending — reimplemented, not imported. */
function activeOf(state: GameState): Seat[] {
  return state.racks.map((_rack, seat) => seat).filter((seat) => !state.withdrawn.includes(seat));
}

/** Invariant 1: board + racks + bag = the TileSet, per face. */
function assertConservation(state: GameState, ruleset: Ruleset): void {
  const everything: TileFace[] = [
    ...[...state.board.values()].map((tile) => (tile.isBlank ? '?' : tile.letter)),
    ...state.racks.flat(),
    ...state.bag,
  ];
  expect(tileCensus(everything)).toEqual(ruleset.tiles.counts);
}

/**
 * Invariant 10: turnQueue is the rotation from `toMove` over the active seats
 * — starts at toMove, each active seat exactly once, no withdrawn seat.
 */
function assertTurnQueue(state: GameState): void {
  const queue = turnQueue(state);
  const seats = state.racks.length;
  const rotation: Seat[] = [];
  for (let step = 0; step < seats; step++) {
    const seat = (state.toMove + step) % seats;
    if (!state.withdrawn.includes(seat)) rotation.push(seat);
  }
  expect([...queue]).toEqual(rotation);
  expect(queue[0]).toBe(state.toMove);
  expect(new Set(queue).size).toBe(queue.length);
  expect([...queue].sort((a, b) => a - b)).toEqual(activeOf(state));
  for (const seat of state.withdrawn) expect(queue).not.toContain(seat);
}

/** Invariant 11: a withdrawn seat's score is frozen and its rack stays empty. */
function assertFrozen(state: GameState, frozen: ReadonlyMap<Seat, number>): void {
  for (const [seat, score] of frozen) {
    expect(state.scores[seat]).toBe(score);
    expect(state.racks[seat]).toEqual([]);
  }
}

/**
 * Invariant 12: standings partition the seats, every active seat outranks
 * every withdrawn one, and group scores strictly decrease inside each block.
 */
function assertStandings(state: GameState, standings: readonly (readonly Seat[])[]): void {
  const allSeats = state.racks.map((_rack, seat) => seat);
  expect(standings.flat().sort((a, b) => a - b)).toEqual(allSeats);

  let seenWithdrawnBlock = false;
  let previous: number | null = null;
  for (const group of standings) {
    const withdrawnHere = group.filter((seat) => state.withdrawn.includes(seat));
    // A placing never mixes the two blocks.
    expect(withdrawnHere.length === 0 || withdrawnHere.length === group.length).toBe(true);
    const isWithdrawnGroup = withdrawnHere.length === group.length;
    // No withdrawn group may precede an active one; the blocks are contiguous.
    if (isWithdrawnGroup && !seenWithdrawnBlock) {
      seenWithdrawnBlock = true;
      previous = null; // scores restart at the top of the withdrawn block
    }
    if (!isWithdrawnGroup) expect(seenWithdrawnBlock).toBe(false);
    const scores = group.map((seat) => state.scores[seat]!);
    for (const score of scores) expect(score).toBe(scores[0]);
    if (previous !== null) expect(scores[0]!).toBeLessThan(previous);
    previous = scores[0]!;
  }
}

/**
 * Invariant 9 helper: independent end-adjustment reimplementation, mirroring
 * §2.1 — 'last-standing' adjusts nothing, 'played-out' hands the active
 * finisher every other ACTIVE rack, 'scoreless' deducts each ACTIVE seat's
 * own rack. A withdrawn seat is never touched (its rack is already back in
 * the bag and its score froze when it left).
 */
function expectedFinalScores(
  rawScores: readonly number[],
  ruleset: Ruleset,
  finalState: GameState,
  by: 'played-out' | 'scoreless' | 'last-standing',
): number[] {
  const sum = (rack: readonly TileFace[]) => rack.reduce((total, face) => total + ruleset.tiles.points[face]!, 0);
  const active = activeOf(finalState);
  if (by === 'last-standing') return [...rawScores];
  if (by === 'played-out') {
    const finisher = active.find((seat) => finalState.racks[seat]!.length === 0)!;
    const scores = [...rawScores];
    let gained = 0;
    for (const seat of active) {
      if (seat === finisher) continue;
      const stranded = sum(finalState.racks[seat]!);
      scores[seat]! -= stranded;
      gained += stranded;
    }
    scores[finisher]! += gained;
    return scores;
  }
  return rawScores.map((score, seat) => (active.includes(seat) ? score - sum(finalState.racks[seat]!) : score));
}

function sortedMove(move: Move): Move {
  if (move.type !== 'play') return move;
  return {
    type: 'play',
    placements: [...move.placements].sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col),
  };
}

async function playRandomGame(ruleset: Ruleset, bagOrder: readonly TileFace[], choices: () => number, seats: number): Promise<void> {
  let state = initialState(ruleset, bagOrder, seats);
  const actions: Action[] = [];
  /** Seat → the score it held when it withdrew (invariant 11). */
  const frozen = new Map<Seat, number>();
  let rawScores: readonly number[] = state.scores;
  let preFinal = state;
  let lastAction: Action | null = null;
  let plies = 0;

  while (result(state).status === 'ongoing') {
    expect(plies, 'game must terminate').toBeLessThan(PLY_CAP);

    // Invariants 10–11 on every ongoing state (the deal included).
    expect(state.withdrawn).not.toContain(state.toMove);
    assertTurnQueue(state);
    assertFrozen(state, frozen);

    const before = state;
    const beforeScores = state.scores;
    const beforeRun = state.scorelessRun;
    const beforeActive = activeOf(state);
    preFinal = state;
    rawScores = beforeScores;

    // Policy: withdraw rarely, and only while >2 seats are still playing —
    // going down to one would end the game outright (§2.1 'last-standing').
    const withdrawRoll = choices() % WITHDRAW_ODDS;
    let action: Action;

    if (withdrawRoll === 0 && beforeActive.length > 2) {
      const seat = state.toMove;
      action = { kind: 'withdraw', seat };
      state = withdraw(state, seat);
      lastAction = action;
      frozen.set(seat, state.scores[seat]!);

      // The rack goes back to the bag END; nothing else about it moves.
      expect(state.racks[seat]).toEqual([]);
      expect([...state.bag]).toEqual([...before.bag, ...before.racks[seat]!]);
      expect([...state.withdrawn]).toEqual([...before.withdrawn, seat].sort((a, b) => a - b));
      expect(state.scorelessRun).toBe(beforeRun);
    } else {
      const rack = state.racks[state.toMove]!;

      // Policy: mostly play; sometimes pass or exchange.
      let move: Move | null = null;
      const roll = choices() % 10;
      if (roll === 0) move = { type: 'pass' };
      else if (roll === 1 && state.bag.length >= ruleset.exchangeMinBag) {
        const count = (choices() % rack.length) + 1;
        move = { type: 'exchange', tiles: rack.slice(0, count) };
      } else {
        const candidates = enumerateCandidatePlays(state, ruleset, 2);
        move = candidates.length > 0 ? candidates[choices() % candidates.length]! : { type: 'pass' };
      }

      // Invariant 2 (sampled): everything checkPlay blessed, applyMove accepts.
      if (state.moveCount === 5) {
        for (const candidate of enumerateCandidatePlays(state, ruleset, 2)) {
          expect(() => applyMove(state, candidate, dict)).not.toThrow();
        }
      }

      // Invariant 7: GCG round-trip at this position (moves only).
      expect(sortedMove(parseGcg(toGcg(move, state), state))).toEqual(sortedMove(move));

      action = { kind: 'move', move };
      state = applyMove(state, move, dict); // invariant 2: never throws
      lastAction = action;
    }

    actions.push(action);
    plies++;

    const finished = result(state).status === 'finished';

    if (!finished) {
      if (action.kind === 'move') {
        // Invariant 8: scorelessRun bookkeeping (visible pre-adjustment too).
        const scored = state.scores.some((score, seat) => score > beforeScores[seat]!);
        expect(state.scorelessRun).toBe(scored ? 0 : beforeRun + 1);
      } else {
        // Withdrawal is not a move: it scores nothing and stops no clock.
        expect([...state.scores]).toEqual([...beforeScores]);
      }
      // Invariant 3: non-negative, non-decreasing until terminal adjustment.
      state.scores.forEach((score, seat) => {
        expect(score).toBeGreaterThanOrEqual(beforeScores[seat]!);
        expect(score).toBeGreaterThanOrEqual(0);
      });
      // Invariant 10: the turn never lands on a seat that has left.
      expect(state.withdrawn).not.toContain(state.toMove);
      assertTurnQueue(state);
    }

    // Invariant 1 every ply — a withdrawal moves a rack to the bag and must
    // leave the census alone just as a move does.
    assertConservation(state, ruleset);

    // Invariant 11 every ply, withdrawals included.
    assertFrozen(state, frozen);

    // Invariant 4: serialize identities.
    expect(deserializeState(serializeState(state))).toEqual(state);
    const publicView = parsePublic(serializePublic(state));
    const { rack: _rack, ...viewSansRack } = playerView(state, 0);
    expect(publicView).toEqual(viewSansRack);

    // Invariant 6: playerView leaks nothing, counts match reality.
    state.racks.forEach((expectedRack, seat) => {
      const view = playerView(state, seat);
      expect(view.rack).toEqual(expectedRack);
      expect(view.bagCount).toBe(state.bag.length);
      expect(view.rackCounts).toEqual(state.racks.map((r) => r.length));
      expect(view.withdrawn).toEqual(state.withdrawn);
      expect('bag' in view).toBe(false);
      expect('racks' in view).toBe(false);
    });

    expect(before.moveCount + 1).toBe(state.moveCount);
  }

  const final = result(state);
  if (final.status !== 'finished') throw new Error('unreachable: loop exits only when finished');

  // Invariant 9: terminal scores equal independent adjustment math. The raw
  // (pre-adjustment) scores are the pre-final scores plus the final move's
  // play total, independently recomputed with scorePlay; a final WITHDRAWAL
  // adds nothing.
  const scoredTotal =
    lastAction?.kind === 'move' && lastAction.move.type === 'play'
      ? scorePlay(preFinal.board, lastAction.move.placements, ruleset).total
      : 0;
  const raw = rawScores.map((score, seat) => (seat === preFinal.toMove ? score + scoredTotal : score));
  expect([...state.scores]).toEqual(expectedFinalScores(raw, ruleset, state, final.by));
  expect([...final.finalScores]).toEqual([...state.scores]);

  // Invariants 11–12 on the terminal state: the finalizer leaves withdrawn
  // seats alone, and the standings are a well-ordered partition.
  assertFrozen(state, frozen);
  assertStandings(state, final.standings);

  // Invariant 5: replay from bagOrder + the action list reproduces the final
  // state — moves through applyMove, withdrawals through withdraw.
  let replayed = initialState(ruleset, bagOrder, seats);
  for (const recorded of actions) {
    replayed = recorded.kind === 'move' ? applyMove(replayed, recorded.move, dict) : withdraw(replayed, recorded.seat);
  }
  expect(replayed).toEqual(state);

  // §8.2: yield a macrotask between games.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe(`property suite (${GAMES} games${SEED ? `, seed ${SEED}` : ''})`, () => {
  for (const rulesetId of ['classic', 'modern'] as const) {
    it(`random legal games hold every invariant [${rulesetId}]`, async () => {
      const ruleset = RULESETS[rulesetId]!;
      const order = canonicalBagOrder(ruleset);
      await fc.assert(
        fc.asyncProperty(
          fc.shuffledSubarray(order, { minLength: order.length, maxLength: order.length }),
          fc.constantFrom(2, 3, 4),
          fc.infiniteStream(fc.nat(1_000_000)),
          async (bagOrder, seats, stream) => {
            const choices = () => stream.next().value as number;
            await playRandomGame(ruleset, bagOrder, choices, seats);
          },
        ),
        { numRuns: Math.max(1, Math.round(GAMES / 2)), ...(SEED !== undefined ? { seed: SEED } : {}) },
      );
    }, 60_000 + GAMES * 200);
  }
});
