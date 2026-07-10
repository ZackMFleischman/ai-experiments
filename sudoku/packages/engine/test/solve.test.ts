import { describe, expect, it } from 'vitest';
import {
  conflictCells,
  countSolutions,
  createRng,
  emptyGrid,
  isComplete,
  solve,
  solveSinglesOnly,
  solveWithRng,
} from '../src/index.js';

// A well-known easy puzzle (Project Euler #96, grid 01) and its solution.
const EASY =
  '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
const EASY_SOLUTION =
  '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

// "AI Escargot"-family hard puzzle: unique but far beyond singles.
const HARD =
  '100007090030020008009600500005300900010080002600004000300000010040000007007000300';

const toGrid = (s: string): number[] => [...s].map((c) => Number(c));

describe('solve', () => {
  it('solves a known puzzle to its known solution', () => {
    expect(solve(toGrid(EASY))).toEqual(toGrid(EASY_SOLUTION));
  });

  it('returns null for a contradictory grid', () => {
    const grid = emptyGrid();
    grid[0] = 5;
    grid[1] = 5; // same row twice
    expect(solve(grid)).toBeNull();
  });

  it('solved grids are complete and conflict-free', () => {
    const solved = solve(toGrid(HARD));
    expect(solved).not.toBeNull();
    expect(isComplete(solved as number[])).toBe(true);
    expect(conflictCells(solved as number[])).toEqual([]);
  });
});

describe('countSolutions', () => {
  it('a proper puzzle has exactly one', () => {
    expect(countSolutions(toGrid(EASY))).toBe(1);
  });

  it('an empty grid has more than one (capped)', () => {
    expect(countSolutions(emptyGrid())).toBe(2);
  });

  it('a contradictory grid has zero', () => {
    const grid = emptyGrid();
    grid[0] = 1;
    grid[1] = 1;
    expect(countSolutions(grid)).toBe(0);
  });
});

describe('solveWithRng', () => {
  it('grows a complete valid grid from empty, deterministically per seed', () => {
    const a = solveWithRng(emptyGrid(), createRng(11));
    const b = solveWithRng(emptyGrid(), createRng(11));
    const c = solveWithRng(emptyGrid(), createRng(12));
    expect(a).toEqual(b);
    expect(isComplete(a as number[])).toBe(true);
    expect(a).not.toEqual(c);
  });
});

describe('solveSinglesOnly', () => {
  it('solves the easy puzzle', () => {
    expect(solveSinglesOnly(toGrid(EASY))).toEqual(toGrid(EASY_SOLUTION));
  });

  it('gives up on the hard puzzle', () => {
    expect(solveSinglesOnly(toGrid(HARD))).toBeNull();
  });
});
