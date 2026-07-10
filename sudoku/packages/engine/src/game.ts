// The play-state reducer @sudoku/app folds through @parlor/solo's
// SoloSession: options generate the puzzle deterministically, entries are the
// player's actions, state is the board. Pure and total — invalid entries
// (given cells, out-of-range) return the state unchanged rather than throw,
// so a stored log can never wedge a session.

import { PEERS, isComplete, type Grid } from './grid.js';
import { generate, type Difficulty } from './generate.js';
import { createRng } from './rng.js';

export interface SudokuOptions {
  seed: number;
  difficulty: Difficulty;
  /** Set for the daily puzzle ('2026-07-10') — display only. */
  daily?: string;
}

export interface SudokuState {
  puzzle: readonly number[];
  solution: readonly number[];
  grid: readonly number[];
  /** Pencil marks, one bitmask per cell (bit d-1 = digit d noted). */
  notes: readonly number[];
  solved: boolean;
}

export type SudokuEntry =
  | { t: 'set'; cell: number; digit: number }
  | { t: 'clear'; cell: number }
  | { t: 'note'; cell: number; digit: number };

export function initSudoku(options: SudokuOptions): SudokuState {
  const { puzzle, solution } = generate(createRng(options.seed), options.difficulty);
  return {
    puzzle,
    solution,
    grid: [...puzzle],
    notes: puzzle.map(() => 0),
    solved: false,
  };
}

export function applySudoku(state: SudokuState, entry: SudokuEntry): SudokuState {
  if (!isPlayable(state, entry.cell)) return state;
  switch (entry.t) {
    case 'set': {
      if (entry.digit < 1 || entry.digit > 9) return state;
      const grid = [...state.grid];
      grid[entry.cell] = entry.digit;
      // Setting a digit clears the cell's own marks and erases that digit
      // from every peer's marks — the bookkeeping every player does by hand.
      const notes = [...state.notes];
      notes[entry.cell] = 0;
      for (const peer of PEERS[entry.cell] as readonly number[]) {
        notes[peer] = (notes[peer] as number) & ~(1 << (entry.digit - 1));
      }
      return { ...state, grid, notes, solved: isSolvedGrid(grid, state.solution) };
    }
    case 'clear': {
      if ((state.grid[entry.cell] as number) === 0) return state;
      const grid = [...state.grid];
      grid[entry.cell] = 0;
      return { ...state, grid, solved: false };
    }
    case 'note': {
      if (entry.digit < 1 || entry.digit > 9) return state;
      if ((state.grid[entry.cell] as number) !== 0) return state;
      const notes = [...state.notes];
      notes[entry.cell] = (notes[entry.cell] as number) ^ (1 << (entry.digit - 1));
      return { ...state, notes };
    }
  }
}

function isPlayable(state: SudokuState, cell: number): boolean {
  return (
    Number.isInteger(cell) &&
    cell >= 0 &&
    cell < state.grid.length &&
    (state.puzzle[cell] as number) === 0
  );
}

function isSolvedGrid(grid: Grid, solution: readonly number[]): boolean {
  return grid.every((v, i) => v === solution[i]) && isComplete(grid);
}

/** Digits noted in a cell, unpacked from the bitmask for rendering. */
export function notedDigits(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.push(d);
  return out;
}

/** How many of each digit are placed — drives the digit-pad "9 used up"
 * affordance. */
export function digitCounts(grid: Grid): number[] {
  const counts = Array.from({ length: 10 }, () => 0);
  for (const v of grid) counts[v] = (counts[v] as number) + 1;
  return counts;
}
