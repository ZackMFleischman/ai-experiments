import { describe, expect, it } from 'vitest';
import { BUG_DESTINATIONS } from '../src/bugs/index';
import { beetleDestinations } from '../src/bugs/beetle';
import { grasshopperDestinations } from '../src/bugs/grasshopper';
import { queenDestinations } from '../src/bugs/queen';
import { buildState, hex } from './helpers';

const keys = (hs: Array<{ q: number; r: number }>) => new Set(hs.map((h) => `${h.q},${h.r}`));

describe('queen (T1.6)', () => {
  it('slides exactly one cell along the hive', () => {
    // wQ at 0,0 next to bQ at 1,0: can pivot to the two cells touching bQ.
    const s = buildState([
      [0, 0, 'wQ1'],
      [1, 0, 'bQ1'],
    ]);
    expect(keys(queenDestinations(s.board, hex(0, 0)))).toEqual(new Set(['1,-1', '0,1']));
  });

  it('cannot squeeze through a two-tile gate', () => {
    // Pocket: destination 1,0 is empty but gated by 1,-1 and 0,1.
    const s = buildState([
      [0, 0, 'wQ1'],
      [1, -1, 'wS1'],
      [0, 1, 'wS2'],
      [2, -1, 'bQ1'],
      [1, 1, 'bS1'],
    ]);
    expect(keys(queenDestinations(s.board, hex(0, 0)))).not.toContain('1,0');
  });

  it('never lands on an occupied cell', () => {
    const s = buildState([
      [0, 0, 'wQ1'],
      [1, 0, 'bQ1'],
      [0, 1, 'bS1'],
    ]);
    for (const d of queenDestinations(s.board, hex(0, 0))) {
      expect(s.board.has(`${d.q},${d.r}`)).toBe(false);
    }
  });
});

describe('beetle (T1.6)', () => {
  it('steps one cell on the ground like a slower queen', () => {
    const s = buildState([
      [0, 0, 'wB1'],
      [1, 0, 'bQ1'],
    ]);
    expect(keys(beetleDestinations(s.board, hex(0, 0)))).toEqual(new Set(['1,-1', '0,1', '1,0']));
  });

  it('climbs on top of adjacent tiles (occupied destinations allowed)', () => {
    const s = buildState([
      [0, 0, 'wB1'],
      [1, 0, 'bQ1'],
    ]);
    expect(keys(beetleDestinations(s.board, hex(0, 0)))).toContain('1,0');
  });

  it('moves in any direction from atop the hive, including dropping off', () => {
    const s = buildState([
      [1, 0, 'bQ1', 'wB1'],
      [2, 0, 'bS1'],
    ]);
    // From on top: all six neighbors are reachable (no higher gates anywhere).
    expect(keys(beetleDestinations(s.board, hex(1, 0)))).toEqual(
      new Set(['0,0', '2,0', '2,-1', '1,-1', '1,1', '0,1']),
    );
  });

  it('is blocked by the beetle gate (both gate stacks strictly higher)', () => {
    // wB1 on wS1 (lifted height 1) stepping to empty 1,0; gates stacked to 2.
    const s = buildState([
      [0, 0, 'wS1', 'wB1'],
      [1, -1, 'wS2', 'wB2'],
      [0, 1, 'bS1', 'bB1'],
      [2, 0, 'bQ1'],
    ]);
    expect(keys(beetleDestinations(s.board, hex(0, 0)))).not.toContain('1,0');
  });
});

describe('grasshopper (T1.6)', () => {
  it('jumps straight over one tile to the first empty cell', () => {
    const s = buildState([
      [0, 0, 'wG1'],
      [1, 0, 'bQ1'],
    ]);
    expect(keys(grasshopperDestinations(s.board, hex(0, 0)))).toEqual(new Set(['2,0']));
  });

  it('jumps over a contiguous line of any length', () => {
    const s = buildState([
      [0, 0, 'wG1'],
      [1, 0, 'bQ1'],
      [2, 0, 'bS1'],
      [3, 0, 'bS2'],
    ]);
    expect(keys(grasshopperDestinations(s.board, hex(0, 0)))).toEqual(new Set(['4,0']));
  });

  it('cannot step into an adjacent empty cell (needs at least one tile to jump)', () => {
    const s = buildState([
      [0, 0, 'wG1'],
      [0, 1, 'bQ1'],
    ]);
    // Only the SE direction has a tile; every other direction yields nothing.
    expect(keys(grasshopperDestinations(s.board, hex(0, 0)))).toEqual(new Set(['0,2']));
  });

  it('jumps in multiple directions when available', () => {
    const s = buildState([
      [0, 0, 'wG1'],
      [1, 0, 'bQ1'],
      [0, 1, 'bS1'],
      [-1, 0, 'wQ1'],
    ]);
    expect(keys(grasshopperDestinations(s.board, hex(0, 0)))).toEqual(
      new Set(['2,0', '0,2', '-2,0']),
    );
  });
});

describe('bug registry (T1.6)', () => {
  it('exposes queen, beetle and grasshopper generators', () => {
    expect(BUG_DESTINATIONS.Q).toBe(queenDestinations);
    expect(BUG_DESTINATIONS.B).toBe(beetleDestinations);
    expect(BUG_DESTINATIONS.G).toBe(grasshopperDestinations);
  });
});
