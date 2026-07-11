import { describe, expect, it } from 'vitest';
import { BRICKS, generateLevel, rowsForLevel } from '../src/index.js';

describe('generateLevel', () => {
  it('is deterministic per (level, rng)', () => {
    expect(generateLevel(3, 12345)).toEqual(generateLevel(3, 12345));
    expect(generateLevel(3, 12345).bricks).not.toEqual(
      generateLevel(3, 54321).bricks,
    );
  });

  it('advances the rng cursor', () => {
    const layout = generateLevel(1, 7);
    expect(layout.rng).not.toBe(7);
  });

  it('fills only the rows in play and never deals an empty level', () => {
    for (let level = 1; level <= 8; level++) {
      const rows = rowsForLevel(level);
      const { bricks } = generateLevel(level, 99 + level);
      expect(bricks).toHaveLength(BRICKS.cols * BRICKS.rows);
      expect(bricks.some((hp) => hp > 0)).toBe(true);
      expect(bricks.slice(rows * BRICKS.cols).every((hp) => hp === 0)).toBe(
        true,
      );
    }
  });

  it('hardens the top rows from level 3', () => {
    const { bricks } = generateLevel(4, 1);
    expect(bricks.slice(0, BRICKS.cols).some((hp) => hp === 2)).toBe(true);
    const level1 = generateLevel(1, 1);
    expect(level1.bricks.every((hp) => hp <= 1)).toBe(true);
  });
});
