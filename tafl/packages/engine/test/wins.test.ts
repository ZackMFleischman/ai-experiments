// End conditions in their fixed order: king escape to a corner, king
// capture, stalemating the opponent, and the threefold-repetition draw.

import { describe, expect, it } from 'vitest';
import {
  allLegalMoves,
  applyTafl,
  initialTafl,
  type TaflState,
} from '../src/index.js';
import { at, pos } from './helpers.js';

describe('escape', () => {
  it('king reaching a corner wins for the defenders', () => {
    const s = pos(
      `...K.......
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ..A........`,
      'defenders',
    );
    const next = applyTafl(s, { from: at(0, 3), to: 0 });
    expect(next.result).toEqual({ winner: 'defenders', by: 'escape' });
  });
});

describe('no-moves', () => {
  it('stalemating the opponent wins for the mover', () => {
    // The lone attacker at a2 has only three exits: a1 is a corner it may
    // never land on, a3 is held, and e2's defender now seals b2.
    const s = pos(
      `...........
       A...D......
       D..........
       ...........
       ...........
       .....K.....
       ...........
       ...........
       ...........
       ...........
       ...........`,
      'defenders',
    );
    const next = applyTafl(s, { from: at(1, 4), to: at(1, 1) });
    expect(next.board.charAt(at(1, 0))).toBe('A'); // sealed, not captured
    expect(allLegalMoves({ ...next, result: null })).toEqual([]);
    expect(next.result).toEqual({ winner: 'defenders', by: 'no-moves' });
  });
});

describe('repetition', () => {
  it('the third occurrence of (board + side-to-move) is a draw', () => {
    // Both sides shuffle in place: d1↔c1 for the attackers mirrored by
    // f4↔e4 for the defenders. Each 4-ply cycle recreates the opening,
    // which initialTafl already counted once — so the second cycle's last
    // move is the third sighting.
    let s: TaflState = initialTafl();
    const cycle = [
      { from: at(0, 3), to: at(0, 2) },
      { from: at(3, 5), to: at(3, 4) },
      { from: at(0, 2), to: at(0, 3) },
      { from: at(3, 4), to: at(3, 5) },
    ];
    for (const move of cycle) {
      s = applyTafl(s, move);
      expect(s.result).toBeNull();
    }
    for (const move of cycle.slice(0, 3)) {
      s = applyTafl(s, move);
      expect(s.result).toBeNull();
    }
    s = applyTafl(s, cycle[3] as { from: number; to: number });
    expect(s.result).toEqual({ winner: null, by: 'repetition' });
    expect(s.board).toBe(initialTafl().board);
  });
});
