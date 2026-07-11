// Setup exactness and the small pure helpers: the initial 12-a-side ranks,
// side/piece lookups, playability, and the a1-style naming move logs use.

import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  CELL_COUNT,
  cellName,
  initialCheckers,
  isPlayable,
  moveName,
  pieceAt,
  sideOf,
} from '../src/index.js';
import { at } from './helpers.js';

describe('constants', () => {
  it('pins the board geometry', () => {
    expect(BOARD_SIZE).toBe(8);
    expect(CELL_COUNT).toBe(64);
  });

  it('exactly the 32 dark squares are playable', () => {
    const playable = Array.from({ length: 64 }, (_, cell) => cell).filter(isPlayable);
    expect(playable).toHaveLength(32);
    for (const cell of playable) {
      expect((Math.floor(cell / 8) + (cell % 8)) % 2).toBe(1);
    }
  });
});

describe('initialCheckers', () => {
  it('sets up 12 dark men on rows 0-2 and 12 light men on rows 5-7, dark to move', () => {
    const s = initialCheckers();
    expect(s.board).toBe(
      '.d.d.d.d' + 'd.d.d.d.' + '.d.d.d.d' + '........' + '........' + 'l.l.l.l.' + '.l.l.l.l' + 'l.l.l.l.',
    );
    expect(s.toMove).toBe('dark');
    expect(s.moveCount).toBe(0);
    expect(s.result).toBeNull();
  });

  it('places every man on a dark square, none anywhere else', () => {
    const s = initialCheckers();
    const counts = { d: 0, D: 0, l: 0, L: 0, '.': 0 };
    for (let cell = 0; cell < 64; cell++) {
      const piece = pieceAt(s, cell);
      counts[piece]++;
      if (piece !== '.') expect(isPlayable(cell)).toBe(true);
    }
    expect(counts).toEqual({ d: 12, D: 0, l: 12, L: 0, '.': 40 });
  });

  it('seeds the opening position into seen (it counts toward repetition)', () => {
    const s = initialCheckers();
    expect(s.seen[`${s.board}|dark`]).toBe(1);
    expect(Object.keys(s.seen)).toHaveLength(1);
  });
});

describe('sideOf / pieceAt', () => {
  it('assigns men and kings to their side and nobody to empty', () => {
    expect(sideOf('d')).toBe('dark');
    expect(sideOf('D')).toBe('dark');
    expect(sideOf('l')).toBe('light');
    expect(sideOf('L')).toBe('light');
    expect(sideOf('.')).toBeNull();
  });

  it('pieceAt throws on out-of-range cells', () => {
    const s = initialCheckers();
    expect(() => pieceAt(s, -1)).toThrow(RangeError);
    expect(() => pieceAt(s, 64)).toThrow(RangeError);
  });
});

describe('cellName / moveName', () => {
  it('names files a-h and ranks 1 (top) to 8 (bottom)', () => {
    expect(cellName(1)).toBe('b1');
    expect(cellName(7)).toBe('h1');
    expect(cellName(at(2, 1))).toBe('b3');
    expect(cellName(56)).toBe('a8');
    expect(cellName(62)).toBe('g8');
    expect(() => cellName(64)).toThrow(RangeError);
  });

  it('joins simple moves with a dash and jumps with ×', () => {
    expect(moveName({ path: [at(2, 1), at(3, 0)] })).toBe('b3-a4');
    expect(moveName({ path: [at(5, 1), at(3, 3)] })).toBe('b6×d4');
    expect(moveName({ path: [at(5, 1), at(3, 3), at(1, 5)] })).toBe('b6×d4×f2');
  });
});
