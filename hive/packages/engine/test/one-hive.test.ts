import { describe, expect, it } from 'vitest';
import { articulationCells, canDepart } from '../src/rules';
import { buildState, hex } from './helpers';

describe('one-hive rule (T1.4)', () => {
  it('the middle of a line is an articulation cell; the ends are not', () => {
    const s = buildState([
      [0, 0, 'wQ1'],
      [1, 0, 'bQ1'],
      [2, 0, 'wA1'],
    ]);
    const cuts = articulationCells(s.board);
    expect(cuts.has('1,0')).toBe(true);
    expect(cuts.has('0,0')).toBe(false);
    expect(cuts.has('2,0')).toBe(false);
    expect(canDepart(s.board, hex(1, 0))).toBe(false);
    expect(canDepart(s.board, hex(0, 0))).toBe(true);
    expect(canDepart(s.board, hex(2, 0))).toBe(true);
  });

  it('a ring has no articulation cells — every tile may depart', () => {
    const ring: Array<[number, number, ...string[]]> = [
      [0, 0, 'wQ1'],
      [1, 0, 'wA1'],
      [1, 1, 'wA2'],
      [0, 2, 'bQ1'],
      [-1, 2, 'bA1'],
      [-1, 1, 'bA2'],
    ];
    // sanity: it is a cycle (each consecutive pair adjacent)
    const s = buildState(ring);
    expect(articulationCells(s.board).size).toBe(0);
    for (const [q, r] of ring) expect(canDepart(s.board, hex(q, r))).toBe(true);
  });

  it('a branch point in a T shape cannot depart', () => {
    const s = buildState([
      [-1, 0, 'wA1'],
      [0, 0, 'wQ1'],
      [1, 0, 'bQ1'],
      [0, 1, 'bA1'],
    ]);
    expect(canDepart(s.board, hex(0, 0))).toBe(false);
    expect(canDepart(s.board, hex(-1, 0))).toBe(true);
    expect(canDepart(s.board, hex(1, 0))).toBe(true);
    expect(canDepart(s.board, hex(0, 1))).toBe(true);
  });

  it('tops of stacks are never articulation-blocked', () => {
    // Beetle on the articulation cell: lifting the beetle leaves the spider,
    // so the hive stays whole.
    const s = buildState([
      [0, 0, 'wQ1'],
      [1, 0, 'wS1', 'bB1'],
      [2, 0, 'bQ1'],
    ]);
    expect(articulationCells(s.board).has('1,0')).toBe(true);
    expect(canDepart(s.board, hex(1, 0))).toBe(true);
  });

  it('a lone pair: both tiles may depart', () => {
    const s = buildState([
      [0, 0, 'wQ1'],
      [1, 0, 'bQ1'],
    ]);
    expect(canDepart(s.board, hex(0, 0))).toBe(true);
    expect(canDepart(s.board, hex(1, 0))).toBe(true);
  });
});
