// Property sweep: whole random games under fast-check seeds. Move choice
// uses mulberry32 (no Math.random — the engine gate applies to tests too).
// TAFL_PROP_GAMES widens the sweep; the default keeps `pnpm test` fast.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allLegalMoves,
  applyTafl,
  initialTafl,
  serializeTafl,
  type TaflState,
} from '../src/index.js';

declare const process: { env: Record<string, string | undefined> };

const GAMES = Number(process.env['TAFL_PROP_GAMES'] ?? 10);
const MAX_PLIES = 400;

/** Deterministic PRNG seeded by fast-check — the only randomness in play. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Play a full random game, asserting the invariants at every ply. */
function playGame(seed: number): TaflState {
  const rand = mulberry32(seed);
  let state = initialTafl();
  for (let ply = 0; ply < MAX_PLIES && state.result === null; ply++) {
    const moves = allLegalMoves(state);
    // While the game is live there is always something to play.
    expect(moves.length).toBeGreaterThan(0);
    const move = moves[Math.floor(rand() * moves.length)];
    if (move === undefined) throw new Error('unreachable: empty move list');
    state = applyTafl(state, move); // never throws on a listed move
    expect(state.board).toHaveLength(49);
    const kings = state.board.split('').filter((ch) => ch === 'K').length;
    if (state.result !== null && state.result.by === 'capture') {
      expect(kings).toBe(0);
    } else {
      expect(kings).toBe(1); // exactly one king until captured
    }
  }
  return state;
}

describe('random games', () => {
  it('hold the invariants and replay to the identical final state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const a = playGame(seed);
        const b = playGame(seed);
        expect(serializeTafl(b)).toBe(serializeTafl(a));
      }),
      { numRuns: GAMES },
    );
  });
});
