// End conditions: the opponent starts their turn with no legal moves — both
// the swept-off-the-board and the fully-blocked flavors — and the
// threefold-repetition draw.

import { describe, expect, it } from 'vitest';
import { allLegalMoves, applyCheckers, type CheckersState } from '../src/index.js';
import { at, pos } from './helpers.js';

describe('no-moves: no pieces left', () => {
  it('capturing the last enemy piece wins for the mover', () => {
    const s = pos(
      `........
       ........
       ........
       ..d.....
       .l......
       ........
       ........
       ........`,
      'light',
    );
    const next = applyCheckers(s, { path: [at(4, 1), at(2, 3)] });
    expect(next.board.includes('d')).toBe(false);
    expect(next.result).toEqual({ winner: 'light', by: 'no-moves' });
  });
});

describe('no-moves: blocked', () => {
  it('sealing the last mobile enemy piece wins for the mover', () => {
    // Light's lone man sits in the a8 corner: b7 is held by a dark man and
    // dark's move fills c6, the only jump landing — light is stuck with a
    // piece still on the board.
    const s = pos(
      `........
       ........
       ........
       ........
       ...d....
       ........
       .d......
       l.......`,
      'dark',
    );
    const next = applyCheckers(s, { path: [at(4, 3), at(5, 2)] });
    expect(next.board.charAt(at(7, 0))).toBe('l'); // sealed, not captured
    expect(allLegalMoves({ ...next, result: null })).toEqual([]);
    expect(next.result).toEqual({ winner: 'dark', by: 'no-moves' });
  });
});

describe('repetition', () => {
  it('the third occurrence of (board + side-to-move) is a draw', () => {
    // Two lone kings shuffle in place, never in reach of each other. Each
    // 4-ply cycle recreates the starting position, which `pos` already
    // counted once — so the second cycle's last move is the third sighting.
    const start = pos(
      `........
       ..D.....
       ........
       ........
       ........
       ......L.
       ........
       ........`,
      'dark',
    );
    const cycle = [
      { path: [at(1, 2), at(2, 1)] },
      { path: [at(5, 6), at(4, 7)] },
      { path: [at(2, 1), at(1, 2)] },
      { path: [at(4, 7), at(5, 6)] },
    ];
    let s: CheckersState = start;
    for (const move of cycle) {
      s = applyCheckers(s, move);
      expect(s.result).toBeNull();
    }
    for (const move of cycle.slice(0, 3)) {
      s = applyCheckers(s, move);
      expect(s.result).toBeNull();
    }
    s = applyCheckers(s, cycle[3] as { path: number[] });
    expect(s.result).toEqual({ winner: null, by: 'repetition' });
    expect(s.board).toBe(start.board);
  });
});
