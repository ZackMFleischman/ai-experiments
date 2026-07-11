// Level layouts: deterministic per (seed, level). Early levels are sparse
// single-hit walls; later ones fill the grid and harden the top rows. The
// rng cursor is taken and returned so layout generation is part of the same
// deterministic fold as everything else.

import { nextRand } from './rng.js';
import { BRICKS } from './state.js';

export interface LevelLayout {
  bricks: number[];
  rng: number;
}

/** Rows in play at a level (fills the grid by level 4). */
export function rowsForLevel(level: number): number {
  return Math.min(2 + level, BRICKS.rows);
}

export function generateLevel(level: number, rng: number): LevelLayout {
  const rows = rowsForLevel(level);
  // Chance a cell is skipped — levels get denser as they go.
  const gapChance = Math.max(0, 0.25 - (level - 1) * 0.05);
  // From level 3 on, the top rows take two hits.
  const hardRows = Math.max(0, Math.min(level - 2, 2));
  const bricks: number[] = [];
  let cursor = rng;
  for (let row = 0; row < BRICKS.rows; row++) {
    for (let col = 0; col < BRICKS.cols; col++) {
      if (row >= rows) {
        bricks.push(0);
        continue;
      }
      let roll: number;
      [roll, cursor] = nextRand(cursor);
      if (roll < gapChance) {
        bricks.push(0);
        continue;
      }
      bricks.push(row < hardRows ? 2 : 1);
    }
  }
  // A level must contain something to clear; deterministic fallback for the
  // (vanishingly unlikely) all-gaps roll.
  if (!bricks.some((hp) => hp > 0)) {
    for (let col = 0; col < BRICKS.cols; col++) bricks[col] = 1;
  }
  return { bricks, rng: cursor };
}
