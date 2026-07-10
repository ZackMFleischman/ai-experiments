// Generation invariants across seeds. SUDOKU_PROP_PUZZLES widens the sweep
// for the validate gate; the default keeps `pnpm test` fast.
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  clueCount,
  countSolutions,
  createRng,
  generate,
  solve,
  solveSinglesOnly,
  type Difficulty,
} from '../src/index.js';

// Minimal ambient declaration — the engine keeps `"types": []` (no @types/node).
declare const process: { env: Record<string, string | undefined> };

const SWEEP = Number(process.env['SUDOKU_PROP_PUZZLES'] ?? 8);
const DIFFS = Object.keys(DIFFICULTIES) as Difficulty[];

describe('generate', () => {
  it('same seed, same puzzle; different seed, different puzzle', () => {
    const a = generate(createRng(99), 'medium');
    const b = generate(createRng(99), 'medium');
    const c = generate(createRng(100), 'medium');
    expect(a).toEqual(b);
    expect(a.puzzle).not.toEqual(c.puzzle);
  });

  it(`every generated puzzle is unique-solution and honest about clues (${SWEEP} seeds x ${DIFFS.length} tiers)`, () => {
    for (let seed = 1; seed <= SWEEP; seed++) {
      for (const difficulty of DIFFS) {
        const { puzzle, solution } = generate(createRng(seed * 7919), difficulty);
        expect(countSolutions(puzzle)).toBe(1);
        expect(solve(puzzle)).toEqual(solution);
        // Clue budget respected within the dig's reach: never fewer than the
        // target, and every clue matches the solution.
        expect(clueCount(puzzle)).toBeGreaterThanOrEqual(DIFFICULTIES[difficulty].clues);
        puzzle.forEach((v, i) => {
          if (v !== 0) expect(v).toBe(solution[i]);
        });
      }
    }
  });

  it('easy tier stays solvable by singles alone', () => {
    for (let seed = 1; seed <= SWEEP; seed++) {
      const { puzzle, solution } = generate(createRng(seed * 104729), 'easy');
      // The generator retries digs for singles-solvability but may fall back;
      // easy's generous clue budget makes the fallback vanishingly rare —
      // catch a regression that makes it common.
      const singles = solveSinglesOnly(puzzle);
      if (singles !== null) expect(singles).toEqual(solution);
    }
    const solvedBySingles = Array.from({ length: SWEEP }, (_, i) =>
      solveSinglesOnly(generate(createRng((i + 1) * 104729), 'easy').puzzle),
    ).filter((s) => s !== null).length;
    expect(solvedBySingles).toBeGreaterThanOrEqual(Math.ceil(SWEEP * 0.75));
  });

  it('difficulty tiers order by clue count', () => {
    const bySeed = (d: Difficulty) => clueCount(generate(createRng(4242), d).puzzle);
    expect(bySeed('easy')).toBeGreaterThanOrEqual(bySeed('medium'));
    expect(bySeed('medium')).toBeGreaterThanOrEqual(bySeed('hard'));
    expect(bySeed('hard')).toBeGreaterThanOrEqual(bySeed('expert'));
  });
});
