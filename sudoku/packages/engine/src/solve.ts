// Solvers. Backtracking over row/col/box bitmasks (a candidate set is one
// AND + popcount, no allocation) with minimum-remaining-values cell choice;
// candidate order is deterministic (or rng-shuffled for generation).
// countSolutions caps at 2 — generation only ever asks "unique or not".

import { CELLS, boxOf, candidatesOf, colOf, rowOf, type Grid } from './grid.js';

const ALL = 0x1ff; // digits 1..9 as bits 0..8

interface Masks {
  row: number[];
  col: number[];
  box: number[];
}

/** Build unit masks; null when the grid already contradicts itself. */
function buildMasks(grid: number[]): Masks | null {
  const row = Array.from({ length: 9 }, () => 0);
  const col = Array.from({ length: 9 }, () => 0);
  const box = Array.from({ length: 9 }, () => 0);
  for (let cell = 0; cell < CELLS; cell++) {
    const v = grid[cell] as number;
    if (v === 0) continue;
    const bit = 1 << (v - 1);
    const r = rowOf(cell);
    const c = colOf(cell);
    const b = boxOf(cell);
    if ((row[r] as number) & bit || (col[c] as number) & bit || (box[b] as number) & bit) return null;
    row[r] = (row[r] as number) | bit;
    col[c] = (col[c] as number) | bit;
    box[b] = (box[b] as number) | bit;
  }
  return { row, col, box };
}

function popcount(mask: number): number {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}

function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.push(d);
  return out;
}

type Order = ((digits: number[]) => number[]) | null;

/** MRV search. `count` mode keeps going to the cap; `solve` mode stops at 1. */
function run(grid: number[], masks: Masks, order: Order, cap: number): number {
  let found = 0;
  const walk = (): void => {
    let bestCell = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let cell = 0; cell < CELLS; cell++) {
      if ((grid[cell] as number) !== 0) continue;
      const mask =
        ALL & ~((masks.row[rowOf(cell)] as number) | (masks.col[colOf(cell)] as number) | (masks.box[boxOf(cell)] as number));
      const count = popcount(mask);
      if (count === 0) return; // stuck
      if (count < bestCount) {
        bestCell = cell;
        bestMask = mask;
        bestCount = count;
        if (count === 1) break;
      }
    }
    if (bestCell === -1) {
      found++;
      return;
    }
    const digits = order ? order(digitsOf(bestMask)) : digitsOf(bestMask);
    const r = rowOf(bestCell);
    const c = colOf(bestCell);
    const b = boxOf(bestCell);
    for (const digit of digits) {
      const bit = 1 << (digit - 1);
      grid[bestCell] = digit;
      masks.row[r] = (masks.row[r] as number) | bit;
      masks.col[c] = (masks.col[c] as number) | bit;
      masks.box[b] = (masks.box[b] as number) | bit;
      walk();
      masks.row[r] = (masks.row[r] as number) & ~bit;
      masks.col[c] = (masks.col[c] as number) & ~bit;
      masks.box[b] = (masks.box[b] as number) & ~bit;
      if (found >= cap) {
        // Leave the found solution in place for solve(); callers counting
        // past 1 only care about the number.
        return;
      }
      grid[bestCell] = 0;
    }
  };
  walk();
  return found;
}

/** Deterministic solve; null when unsolvable. */
export function solve(grid: Grid): number[] | null {
  const work = [...grid];
  const masks = buildMasks(work);
  if (!masks) return null;
  return run(work, masks, null, 1) === 1 ? work : null;
}

/** Randomized solve — used to grow a fresh full solution from an empty grid. */
export function solveWithRng(grid: Grid, rng: () => number): number[] | null {
  const work = [...grid];
  const masks = buildMasks(work);
  if (!masks) return null;
  const order = (digits: number[]): number[] => {
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = digits[i] as number;
      digits[i] = digits[j] as number;
      digits[j] = tmp;
    }
    return digits;
  };
  return run(work, masks, order, 1) === 1 ? work : null;
}

/** Number of solutions, capped (2 means "not unique" and stops there). */
export function countSolutions(grid: Grid, cap = 2): number {
  const work = [...grid];
  const masks = buildMasks(work);
  if (!masks) return 0;
  return run(work, masks, null, cap);
}

/** Singles-only solve: repeatedly fill naked singles (one candidate in a
 * cell) and hidden singles (one home for a digit in a row/col/box). The
 * "human without notes" difficulty oracle — easy/medium puzzles must fall
 * to this; null means techniques beyond singles are required. */
export function solveSinglesOnly(grid: Grid): number[] | null {
  const work = [...grid];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let cell = 0; cell < CELLS; cell++) {
      if ((work[cell] as number) !== 0) continue;
      const candidates = candidatesOf(work, cell);
      if (candidates.length === 0) return null;
      if (candidates.length === 1) {
        work[cell] = candidates[0] as number;
        progressed = true;
      }
    }
    // Hidden singles per unit.
    for (const unit of UNITS) {
      for (let digit = 1; digit <= 9; digit++) {
        if (unit.some((cell) => work[cell] === digit)) continue;
        const homes = unit.filter(
          (cell) => (work[cell] as number) === 0 && candidatesOf(work, cell).includes(digit),
        );
        if (homes.length === 1) {
          work[homes[0] as number] = digit;
          progressed = true;
        }
      }
    }
  }
  return work.every((v) => v !== 0) ? work : null;
}

/** All 27 units (9 rows, 9 columns, 9 boxes). */
const UNITS: readonly (readonly number[])[] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const top = Math.floor(b / 3) * 27 + (b % 3) * 3;
    units.push(Array.from({ length: 9 }, (_, i) => top + Math.floor(i / 3) * 9 + (i % 3)));
  }
  return units;
})();
