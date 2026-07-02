import { describe, expect, it } from 'vitest';
import { canSlide, commonNeighbors } from '../src/rules';
import { buildState, hex } from './helpers';

// canSlide(board, from, to) expects the moving tile ALREADY lifted off `from`.
describe('freedom-to-move gate (T1.5)', () => {
  it('commonNeighbors finds the two shared cells of an adjacent pair', () => {
    const [n1, n2] = commonNeighbors(hex(0, 0), hex(1, 0));
    const keys = new Set([`${n1.q},${n1.r}`, `${n2.q},${n2.r}`]);
    expect(keys).toEqual(new Set(['1,-1', '0,1']));
  });

  it('ground slide through a two-tile gate is blocked', () => {
    // Mover slides 0,0 → 1,0; both common neighbors (1,-1) and (0,1) occupied.
    const s = buildState([
      [1, -1, 'wS1'],
      [0, 1, 'bS1'],
      [2, 0, 'wQ1'], // rest of hive
    ]);
    expect(canSlide(s.board, hex(0, 0), hex(1, 0))).toBe(false);
  });

  it('ground slide with exactly one shared neighbor occupied is legal', () => {
    const s = buildState([
      [1, -1, 'wS1'],
      [2, 0, 'wQ1'],
    ]);
    expect(canSlide(s.board, hex(0, 0), hex(1, 0))).toBe(true);
  });

  it('ground slide with neither shared neighbor occupied loses contact — illegal', () => {
    const s = buildState([[2, 0, 'wQ1']]);
    expect(canSlide(s.board, hex(0, 0), hex(1, 0))).toBe(false);
  });

  it('climbing onto the hive through a height-1 gate is legal (gate not higher than landing)', () => {
    // Beetle (lifted from 0,0) climbs onto 1,0 (height 1); gates at height 1.
    const s = buildState([
      [1, 0, 'wS1'],
      [1, -1, 'wS2'],
      [0, 1, 'bS1'],
      [2, 0, 'bQ1'],
    ]);
    expect(canSlide(s.board, hex(0, 0), hex(1, 0))).toBe(true);
  });

  it('the beetle gate: both gate stacks strictly higher than origin and destination block the move', () => {
    // Beetle on top of a single tile (lifted height a=1) stepping to empty (b=0);
    // both gates are stacks of 2 → min(2,2) > max(1,0): blocked.
    const s = buildState([
      [0, 0, 'wS1'], // beetle's origin stack minus the beetle itself
      [1, -1, 'wS2', 'wB1'],
      [0, 1, 'bS1', 'bB1'],
      [2, 0, 'bQ1'],
    ]);
    expect(canSlide(s.board, hex(0, 0), hex(1, 0))).toBe(false);
    // Open one gate down to height 1 and the step is legal again.
    const s2 = buildState([
      [0, 0, 'wS1'],
      [1, -1, 'wS2', 'wB1'],
      [0, 1, 'bS1'],
      [2, 0, 'bQ1'],
    ]);
    expect(canSlide(s2.board, hex(0, 0), hex(1, 0))).toBe(true);
  });

  it('dropping down from a stack over a lower gate is legal', () => {
    // a=1 (beetle was on a stack of 2), b=0, gates 1 and 1 → min(1,1) <= 1.
    const s = buildState([
      [0, 0, 'wS1'],
      [1, -1, 'wS2'],
      [0, 1, 'bS1'],
      [2, 0, 'bQ1'],
    ]);
    expect(canSlide(s.board, hex(0, 0), hex(1, 0))).toBe(true);
  });
});
