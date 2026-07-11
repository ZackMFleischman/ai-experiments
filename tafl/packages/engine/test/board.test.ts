// Setup exactness and the small pure helpers: the initial Brandub cross,
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
    expect(BOARD_SIZE).toBe(7);
    expect(THRONE).toBe(24);
    expect(CORNERS).toEqual([0, 6, 42, 48]);
  });
});

describe('initialTafl', () => {
  it('sets up the exact Brandub cross, attackers to move', () => {
    const s = initialTafl();
    expect(s.board).toBe('...A...' + '...A...' + '...D...' + 'AADKDAA' + '...D...' + '...A...' + '...A...');
    expect(s.toMove).toBe('attackers');
    expect(s.moveCount).toBe(0);
    expect(s.result).toBeNull();
  });

  it('places every piece where the rules say', () => {
    const s = initialTafl();
    const attackers = [at(0, 3), at(1, 3), at(3, 0), at(3, 1), at(3, 5), at(3, 6), at(5, 3), at(6, 3)];
    const defenders = [at(2, 3), at(3, 2), at(3, 4), at(4, 3)];
    for (const cell of attackers) expect(pieceAt(s, cell)).toBe('A');
    for (const cell of defenders) expect(pieceAt(s, cell)).toBe('D');
    expect(pieceAt(s, THRONE)).toBe('K');
    const counts = { A: 0, D: 0, K: 0, '.': 0 };
    for (const ch of s.board) counts[ch as keyof typeof counts]++;
    expect(counts).toEqual({ A: 8, D: 4, K: 1, '.': 36 });
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
    expect(() => pieceAt(s, 49)).toThrow(RangeError);
  });
});

describe('cellName / moveName', () => {
  it('names files a-g and ranks 1 (top) to 7 (bottom)', () => {
    expect(cellName(0)).toBe('a1');
    expect(cellName(6)).toBe('g1');
    expect(cellName(THRONE)).toBe('d4');
    expect(cellName(42)).toBe('a7');
    expect(cellName(48)).toBe('g7');
    expect(() => cellName(49)).toThrow(RangeError);
  });

  it('joins the endpoints with a dash', () => {
    expect(moveName({ from: at(0, 3), to: at(0, 1) })).toBe('d1-b1');
    expect(moveName({ from: THRONE, to: 0 })).toBe('d4-a1');
  });
});
