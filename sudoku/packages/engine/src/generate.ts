// Puzzle generation: grow a full solution with randomized backtracking, then
// dig clues out in rng order, keeping every intermediate puzzle uniquely
// solvable. Difficulty is a clue budget plus, for the easier tiers, a
// singles-only solvability requirement (solve.ts oracle) — retried across a
// bounded number of digs so generation stays deterministic and always
// terminates with a valid unique puzzle.

import { CELLS, emptyGrid, type Grid } from './grid.js';
import { shuffled } from './rng.js';
import { countSolutions, solveSinglesOnly, solveWithRng } from './solve.js';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export const DIFFICULTIES: Record<Difficulty, { clues: number; singlesOnly: boolean }> = {
  easy: { clues: 40, singlesOnly: true },
  medium: { clues: 34, singlesOnly: true },
  hard: { clues: 28, singlesOnly: false },
  expert: { clues: 24, singlesOnly: false },
};

export interface Puzzle {
  /** 81 cells, 0 = empty; the given clues. */
  puzzle: number[];
  /** The unique solution. */
  solution: number[];
  difficulty: Difficulty;
}

const MAX_DIGS = 8;

export function generate(rng: () => number, difficulty: Difficulty): Puzzle {
  const spec = DIFFICULTIES[difficulty];
  const solution = solveWithRng(emptyGrid(), rng);
  if (!solution) throw new Error('unreachable: an empty grid always solves');

  let fallback: number[] | null = null;
  for (let attempt = 0; attempt < MAX_DIGS; attempt++) {
    const puzzle = dig(solution, spec.clues, rng);
    if (!spec.singlesOnly || solveSinglesOnly(puzzle) !== null) {
      return { puzzle, solution, difficulty };
    }
    fallback ??= puzzle;
  }
  // Every dig needed more than singles; ship the first unique puzzle rather
  // than loop — it plays slightly harder than labeled, never invalid.
  return { puzzle: fallback as number[], solution, difficulty };
}

function dig(solution: readonly number[], targetClues: number, rng: () => number): number[] {
  const puzzle = [...solution];
  let clues = CELLS;
  for (const cell of shuffled(Array.from({ length: CELLS }, (_, i) => i), rng)) {
    if (clues <= targetClues) break;
    const kept = puzzle[cell] as number;
    puzzle[cell] = 0;
    if (countSolutions(puzzle) === 1) {
      clues--;
    } else {
      puzzle[cell] = kept;
    }
  }
  return puzzle;
}

/** Count of given clues — handy for tests and UI. */
export function clueCount(puzzle: Grid): number {
  return puzzle.reduce((n: number, v) => (v !== 0 ? n + 1 : n), 0);
}
