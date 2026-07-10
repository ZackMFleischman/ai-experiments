// @sudoku/engine — pure, zero-dependency, deterministic sudoku kernel:
// geometry/validity, solvers (backtracking + singles oracle), seeded
// generation with uniqueness guarantees, and the play-state reducer folded
// by @parlor/solo's SoloSession. No DOM, no rng of its own beyond the
// injected/seeded createRng, no Math.random anywhere.

export {
  CELLS,
  DIGITS,
  PEERS,
  boxOf,
  candidatesOf,
  colOf,
  conflictCells,
  emptyGrid,
  isComplete,
  rowOf,
  type Grid,
} from './grid.js';

export { createRng, shuffled } from './rng.js';

export { countSolutions, solve, solveSinglesOnly, solveWithRng } from './solve.js';

export {
  DIFFICULTIES,
  clueCount,
  generate,
  type Difficulty,
  type Puzzle,
} from './generate.js';

export {
  applySudoku,
  digitCounts,
  initSudoku,
  notedDigits,
  type SudokuEntry,
  type SudokuOptions,
  type SudokuState,
} from './game.js';
