// Setup exactness and the small pure helpers: the initial hnefatafl camps,
// side/piece lookups, and the a1-style naming used by move logs.

import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  CORNERS,
  THRONE,
  cellName,
  initialTafl,
  moveName,
  pieceAt,
  sideOf,
} from '../src/index.js';
import { at } from './helpers.js';

describe('constants', () => {
  it('pins the board geometry', () => {
    expect(BOARD_SIZE).toBe(11);
    expect(THRONE).toBe(60);
    expect(CORNERS).toEqual([0, 10, 110, 120]);
  });
});

describe('initialTafl', () => {
  it('sets up the exact hnefatafl position, attackers to move', () => {
    const s = initialTafl();
    expect(s.board).toBe(
      '...AAAAA...' +
        '.....A.....' +
        '...........' +
        'A....D....A' +
        'A...DDD...A' +
        'AA.DDKDD.AA' +
        'A...DDD...A' +
        'A....D....A' +
        '...........' +
        '.....A.....' +
        '...AAAAA...',
    );
    expect(s.toMove).toBe('attackers');
    expect(s.moveCount).toBe(0);
    expect(s.result).toBeNull();
  });

  it('places every piece where the rules say', () => {
    const s = initialTafl();
    // Four symmetric camps of six attackers: five on the edge, one in front.
    const attackers = [
      at(0, 3), at(0, 4), at(0, 5), at(0, 6), at(0, 7), at(1, 5), // top
      at(10, 3), at(10, 4), at(10, 5), at(10, 6), at(10, 7), at(9, 5), // bottom
      at(3, 0), at(4, 0), at(5, 0), at(6, 0), at(7, 0), at(5, 1), // left
      at(3, 10), at(4, 10), at(5, 10), at(6, 10), at(7, 10), at(5, 9), // right
    ];
    // Twelve defenders in a diamond around the throne.
    const defenders = [
      at(3, 5),
      at(4, 4), at(4, 5), at(4, 6),
      at(5, 3), at(5, 4), at(5, 6), at(5, 7),
      at(6, 4), at(6, 5), at(6, 6),
      at(7, 5),
    ];
    for (const cell of attackers) expect(pieceAt(s, cell)).toBe('A');
    for (const cell of defenders) expect(pieceAt(s, cell)).toBe('D');
    expect(pieceAt(s, THRONE)).toBe('K');
    const counts = { A: 0, D: 0, K: 0, '.': 0 };
    for (const ch of s.board) counts[ch as keyof typeof counts]++;
    expect(counts).toEqual({ A: 24, D: 12, K: 1, '.': 84 });
  });

  it('seeds the opening position into seen (it counts toward repetition)', () => {
    const s = initialTafl();
    expect(s.seen[`${s.board}|attackers`]).toBe(1);
    expect(Object.keys(s.seen)).toHaveLength(1);
  });
});

describe('sideOf / pieceAt', () => {
  it('assigns the king to the defenders and nobody to empty', () => {
    expect(sideOf('A')).toBe('attackers');
    expect(sideOf('D')).toBe('defenders');
    expect(sideOf('K')).toBe('defenders');
    expect(sideOf('.')).toBeNull();
  });

  it('pieceAt throws on out-of-range cells', () => {
    const s = initialTafl();
    expect(() => pieceAt(s, -1)).toThrow(RangeError);
    expect(() => pieceAt(s, 121)).toThrow(RangeError);
  });
});

describe('cellName / moveName', () => {
  it('names files a-k and ranks 1 (top) to 11 (bottom)', () => {
    expect(cellName(0)).toBe('a1');
    expect(cellName(10)).toBe('k1');
    expect(cellName(THRONE)).toBe('f6');
    expect(cellName(110)).toBe('a11');
    expect(cellName(120)).toBe('k11');
    expect(() => cellName(121)).toThrow(RangeError);
  });

  it('joins the endpoints with a dash', () => {
    expect(moveName({ from: at(0, 3), to: at(0, 1) })).toBe('d1-b1');
    expect(moveName({ from: THRONE, to: 0 })).toBe('f6-a1');
  });
});
