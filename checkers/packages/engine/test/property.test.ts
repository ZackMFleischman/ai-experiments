// Property sweep: whole random games under fast-check seeds. Move choice
// uses mulberry32 (no Math.random — the engine gate applies to tests too).
// CHECKERS_PROP_GAMES widens the sweep; the default keeps `pnpm test` fast.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allLegalMoves,
  applyCheckers,
  initialCheckers,
  isPlayable,
  serializeCheckers,
  sideOf,
  type Piece,
  type CheckersState,
} from '../src/index.js';

declare const process: { env: Record<string, string | undefined> };

const GAMES = Number(process.env['CHECKERS_PROP_GAMES'] ?? 10);
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

function count(board: string, side: 'dark' | 'light'): number {
  return board.split('').filter((ch) => sideOf(ch as Piece) === side).length;
}

/** Play a full random game, asserting the invariants at every ply. */
function playGame(seed: number): CheckersState {
  const rand = mulberry32(seed);
  let state = initialCheckers();
  for (let ply = 0; ply < MAX_PLIES && state.result === null; ply++) {
    const moves = allLegalMoves(state);
    // While the game is live there is always something to play.
    expect(moves.length).toBeGreaterThan(0);
    const move = moves[Math.floor(rand() * moves.length)];
    if (move === undefined) throw new Error('unreachable: empty move list');
    const before = state;
    state = applyCheckers(state, move); // never throws on a listed move
    expect(state.board).toHaveLength(64);
    // Piece counts only ever decrease, and never below zero-sum sanity.
    expect(count(state.board, 'dark')).toBeLessThanOrEqual(count(before.board, 'dark'));
    expect(count(state.board, 'light')).toBeLessThanOrEqual(count(before.board, 'light'));
    // Pieces live on dark squares only (one assert per ply keeps this cheap).
    let offSquare = false;
    for (let cell = 0; cell < 64; cell++) {
      if (state.board.charAt(cell) !== '.' && !isPlayable(cell)) offSquare = true;
    }
    expect(offSquare).toBe(false);
  }
  return state;
}

describe('random games', () => {
  it('hold the invariants and replay to the identical final state', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const a = playGame(seed);
        const b = playGame(seed);
        expect(serializeCheckers(b)).toBe(serializeCheckers(a));
      }),
      { numRuns: GAMES },
    );
  });
});
