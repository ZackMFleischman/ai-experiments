// T1.10: property suite — the §6 invariants over random legal games driven
// by fc-shuffled bag orders and an fc choice stream. Runs LEX_PROP_GAMES
// games (default 30; validate:m1 runs 1000). The fc seed is pinned in CI
// (§8.2); a macrotask yield between games keeps vitest's worker RPC alive.
//
// Invariant 5 note: engine-level replay is exact from bagOrder + moves alone
// because applyMove's exchange is deterministic (returned tiles appended);
// server re-shuffle EVENTS are transport state and are covered by T4.5.
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
  type GameState,
  type Move,
  type Ruleset,
  type TileFace,
} from '../src/index.js';
import { canonicalBagOrder, enumerateCandidatePlays, stubDict } from './helpers.js';

const GAMES = Number(process.env.LEX_PROP_GAMES ?? 30);
const SEED = process.env.CI ? 20260704 : undefined;
const PLY_CAP = 400;

const dict = stubDict();

function tileCensus(faces: Iterable<TileFace>): Record<string, number> {
  const census: Record<string, number> = {};
  for (const face of faces) census[face] = (census[face] ?? 0) + 1;
  return census;
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

/** Invariant 9 helper: independent end-adjustment reimplementation. */
function expectedFinalScores(preFinal: GameState, rawScores: readonly number[], ruleset: Ruleset, finalState: GameState): number[] {
  const sum = (rack: readonly TileFace[]) => rack.reduce((total, face) => total + ruleset.tiles.points[face]!, 0);
  const finisher = finalState.bag.length === 0 ? finalState.racks.findIndex((r) => r.length === 0) : -1;
  if (finisher !== -1) {
    const scores = [...rawScores];
    let gained = 0;
    finalState.racks.forEach((rack, seat) => {
      if (seat !== finisher) {
        scores[seat]! -= sum(rack);
        gained += sum(rack);
      }
    });
    scores[finisher]! += gained;
    return scores;
  }
  return rawScores.map((score, seat) => score - sum(finalState.racks[seat]!));
}

function sortedMove(move: Move): Move {
  if (move.type !== 'play') return move;
  return {
    type: 'play',
    placements: [...move.placements].sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col),
  };
}

async function playRandomGame(ruleset: Ruleset, bagOrder: readonly TileFace[], choices: () => number): Promise<void> {
  let state = initialState(ruleset, bagOrder, 2);
  const moves: Move[] = [];
  let rawScores: readonly number[] = state.scores;
  let preFinal = state;
  let plies = 0;

  while (result(state).status === 'ongoing') {
    expect(plies, 'game must terminate').toBeLessThan(PLY_CAP);
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

    // Invariant 7: GCG round-trip at this position.
    expect(sortedMove(parseGcg(toGcg(move, state), state))).toEqual(sortedMove(move));

    const before = state;
    const beforeScores = state.scores;
    const beforeRun = state.scorelessRun;
    preFinal = state;
    rawScores = beforeScores;
    state = applyMove(state, move, dict); // invariant 2: never throws
    moves.push(move);
    plies++;

    const finished = result(state).status === 'finished';

    // Invariant 8: scorelessRun bookkeeping (visible pre-adjustment too).
    if (!finished) {
      const scored = state.scores.some((score, seat) => score > beforeScores[seat]!);
      expect(state.scorelessRun).toBe(scored ? 0 : beforeRun + 1);
      // Invariant 3: non-negative, non-decreasing until terminal adjustment.
      state.scores.forEach((score, seat) => {
        expect(score).toBeGreaterThanOrEqual(beforeScores[seat]!);
        expect(score).toBeGreaterThanOrEqual(0);
      });
    }

    // Invariant 1 every ply.
    assertConservation(state, ruleset);

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
      expect('bag' in view).toBe(false);
      expect('racks' in view).toBe(false);
    });

    expect(before.moveCount + 1).toBe(state.moveCount);
  }

  // Invariant 9: terminal scores equal independent adjustment math. The raw
  // (pre-adjustment) scores are the pre-final scores plus the final move's
  // play total, independently recomputed with scorePlay.
  const lastMove = moves[moves.length - 1]!;
  const scoredTotal = lastMove.type === 'play' ? scorePlay(preFinal.board, lastMove.placements, ruleset).total : 0;
  const raw = rawScores.map((score, seat) => (seat === preFinal.toMove ? score + scoredTotal : score));
  expect([...state.scores]).toEqual(expectedFinalScores(preFinal, raw, ruleset, state));

  // Invariant 5: replay from bagOrder + move list reproduces the final state.
  let replayed = initialState(ruleset, bagOrder, 2);
  for (const move of moves) replayed = applyMove(replayed, move, dict);
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
          fc.infiniteStream(fc.nat(1_000_000)),
          async (bagOrder, stream) => {
            const choices = () => stream.next().value as number;
            await playRandomGame(ruleset, bagOrder, choices);
          },
        ),
        { numRuns: Math.max(1, Math.round(GAMES / 2)), ...(SEED !== undefined ? { seed: SEED } : {}) },
      );
    }, 30_000 + GAMES * 60);
  }
});
