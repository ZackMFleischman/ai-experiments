import { describe, expect, it } from 'vitest';
import { BUG_DESTINATIONS } from '../src/bugs/index';
import { ladybugDestinations } from '../src/bugs/ladybug';
import { buildState, hex } from './helpers';

const keys = (hs: Array<{ q: number; r: number }>) => new Set(hs.map((h) => `${h.q},${h.r}`));

describe('ladybug (T2.1)', () => {
  it('goes exactly two on top then one down — around a lone pair it reaches the far cells', () => {
    // wL1 at 0,0; hive pair bQ (1,0), bS1 (2,0).
    // Up onto bQ, across onto bS1, down to any empty neighbor of bS1 (≠ start);
    // or up onto bQ... only two occupied cells, so paths are (bQ,bS1) and — for
    // 2-step top walks — nothing else. Down-cells of bS1: its 5 empty neighbors.
    const s = buildState([
      [0, 0, 'wL1'],
      [1, 0, 'bQ1'],
      [2, 0, 'bS1'],
    ]);
    expect(keys(ladybugDestinations(s.board, hex(0, 0)))).toEqual(
      new Set(['3,0', '3,-1', '2,-1', '2,1', '1,1']),
    );
  });

  it('cannot make a 1-on-top or 3-on-top move (no shortcut to adjacent cells)', () => {
    const s = buildState([
      [0, 0, 'wL1'],
      [1, 0, 'bQ1'],
      [2, 0, 'bS1'],
    ]);
    const dests = keys(ladybugDestinations(s.board, hex(0, 0)));
    // 1-on-top would land on bQ's other neighbors (e.g. 1,-1 / 0,1) — absent.
    expect(dests).not.toContain('1,-1');
    expect(dests).not.toContain('0,1');
    // It never lands on occupied cells.
    expect(dests).not.toContain('1,0');
    expect(dests).not.toContain('2,0');
  });

  it('never returns to its own starting cell', () => {
    // Ring-ish blob where a 2-top walk could drop back into the origin.
    const s = buildState([
      [0, 0, 'wL1'],
      [1, 0, 'bQ1'],
      [0, 1, 'bS1'],
      [2, 0, 'bA1'],
    ]);
    expect(keys(ladybugDestinations(s.board, hex(0, 0)))).not.toContain('0,0');
  });

  it('every step is gate-checked at height', () => {
    // Same line as the first test, but the climb onto bQ (1,0) is pinched by
    // two height-2 stacks at 1,-1 and 0,1: min(2,2) > max(0,1) blocks it. The
    // far cell 3,0 is only reachable via that climb, so it disappears; cells
    // reachable by climbing the tall stacks instead remain.
    const s = buildState([
      [0, 0, 'wL1'],
      [1, 0, 'bQ1'],
      [2, 0, 'bS1'],
      [1, -1, 'wS1', 'wB1'],
      [0, 1, 'wS2', 'wB2'],
    ]);
    const dests = keys(ladybugDestinations(s.board, hex(0, 0)));
    expect(dests).not.toContain('3,0');
    expect(dests.size).toBeGreaterThan(0); // other routes over the stacks stay open
  });

  it('is registered', () => {
    expect(BUG_DESTINATIONS.L).toBe(ladybugDestinations);
  });
});
