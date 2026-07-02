import { describe, expect, it } from 'vitest';
import { placements } from '../src/rules';
import { ALL_ON, BASE, buildState, placedKinds, placesTo } from './helpers';

describe('placement legality (T1.3)', () => {
  it("white's first placement is at the origin only", () => {
    const s = buildState([], { turn: 1, toMove: 'w' });
    const moves = placements(s);
    expect(new Set(placesTo(moves))).toEqual(new Set(['0,0']));
  });

  it('tournament opening: queen may not be a first placement; all other held bugs may', () => {
    const s = buildState([], { turn: 1, toMove: 'w', options: ALL_ON });
    expect(placedKinds(placements(s))).toEqual(new Set(['A', 'S', 'G', 'B', 'M', 'L', 'P']));
  });

  it('without tournament opening the queen may open', () => {
    const s = buildState([], { turn: 1, toMove: 'w', options: BASE });
    expect(placedKinds(placements(s))).toContain('Q');
  });

  it("black's first placement may touch white (all six neighbors of origin)", () => {
    const s = buildState([[0, 0, 'wS1']], { turn: 1, toMove: 'b' });
    const cells = new Set(placesTo(placements(s)));
    expect(cells).toEqual(new Set(['1,0', '-1,0', '1,-1', '0,-1', '0,1', '-1,1']));
  });

  it('from the second placement on, new tiles touch own color only', () => {
    // wS1 at origin, bS1 east of it. White places: must touch white, not black.
    const s = buildState([[0, 0, 'wS1'], [1, 0, 'bS1']], { turn: 2, toMove: 'w' });
    const cells = new Set(placesTo(placements(s)));
    // Empty neighbors of wS1 that don't also touch bS1:
    expect(cells).toEqual(new Set(['-1,0', '0,-1', '-1,1']));
    expect(cells.has('1,-1')).toBe(false); // touches both — illegal
  });

  it('queen must be placed by turn 4: only queen placements are offered', () => {
    const s = buildState(
      [
        [0, 0, 'wS1'],
        [1, 0, 'bS1'],
        [-1, 0, 'wS2'],
        [2, 0, 'bS2'],
        [-2, 0, 'wG1'],
        [3, 0, 'bG1'],
      ],
      { turn: 4, toMove: 'w' },
    );
    expect(placedKinds(placements(s))).toEqual(new Set(['Q']));
  });

  it('queen-by-4 keeps binding after a forced pass (turn > 4, queen still in hand)', () => {
    const s = buildState(
      [
        [0, 0, 'wS1'],
        [1, 0, 'bS1'],
        [-1, 0, 'wS2'],
        [2, 0, 'bS2'],
        [-2, 0, 'wG1'],
        [3, 0, 'bG1'],
      ],
      { turn: 5, toMove: 'w' },
    );
    expect(placedKinds(placements(s))).toEqual(new Set(['Q']));
  });

  it('a covered cell counts as the covering color for placement', () => {
    // Black beetle sits on top of the white spider: that cell now reads black.
    const s = buildState([[0, 0, 'wS1', 'bB1'], [1, 0, 'bS1']], { turn: 3, toMove: 'w' });
    // White has nothing white-topped to touch: no placements at all.
    expect(placements(s)).toEqual([]);
  });

  it('placement ordinals follow placement order per kind', () => {
    // One white ant already placed → the next ant placed is wA2.
    const s = buildState([[0, 0, 'wA1'], [1, 0, 'bS1']], { turn: 3, toMove: 'w' });
    const ants = placements(s).filter((m) => m.type === 'place' && m.tile.kind === 'A');
    expect(ants.length).toBeGreaterThan(0);
    for (const m of ants) {
      if (m.type === 'place') expect(m.tile.ordinal).toBe(2);
    }
  });

  it('queen placements carry no ordinal ambiguity (single copy: ordinal 1)', () => {
    const s = buildState([[0, 0, 'wA1'], [1, 0, 'bS1']], { turn: 2, toMove: 'w' });
    const queens = placements(s).filter((m) => m.type === 'place' && m.tile.kind === 'Q');
    for (const m of queens) {
      if (m.type === 'place') expect(m.tile.ordinal).toBe(1);
    }
  });
});
