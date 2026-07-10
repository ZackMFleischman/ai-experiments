import { describe, expect, it } from 'vitest';
import {
  applySudoku,
  digitCounts,
  initSudoku,
  notedDigits,
  type SudokuEntry,
  type SudokuState,
} from '../src/index.js';

const OPTIONS = { seed: 7, difficulty: 'easy' as const };

function freshState(): SudokuState {
  return initSudoku(OPTIONS);
}

function firstEmpty(state: SudokuState): number {
  return state.puzzle.findIndex((v) => v === 0);
}

function firstGiven(state: SudokuState): number {
  return state.puzzle.findIndex((v) => v !== 0);
}

describe('initSudoku', () => {
  it('is deterministic per options and starts unsolved at the puzzle', () => {
    const a = freshState();
    const b = freshState();
    expect(a).toEqual(b);
    expect(a.grid).toEqual(a.puzzle);
    expect(a.solved).toBe(false);
    expect(a.notes.every((m) => m === 0)).toBe(true);
  });
});

describe('applySudoku', () => {
  it('sets and clears digits on empty cells only', () => {
    const state = freshState();
    const cell = firstEmpty(state);
    const set = applySudoku(state, { t: 'set', cell, digit: 5 });
    expect(set.grid[cell]).toBe(5);
    const cleared = applySudoku(set, { t: 'clear', cell });
    expect(cleared.grid[cell]).toBe(0);
  });

  it('never touches given cells', () => {
    const state = freshState();
    const cell = firstGiven(state);
    for (const entry of [
      { t: 'set', cell, digit: 1 },
      { t: 'clear', cell },
      { t: 'note', cell, digit: 1 },
    ] satisfies SudokuEntry[]) {
      expect(applySudoku(state, entry)).toBe(state);
    }
  });

  it('rejects out-of-range cells and digits without throwing', () => {
    const state = freshState();
    expect(applySudoku(state, { t: 'set', cell: -1, digit: 5 })).toBe(state);
    expect(applySudoku(state, { t: 'set', cell: 81, digit: 5 })).toBe(state);
    expect(applySudoku(state, { t: 'set', cell: firstEmpty(state), digit: 0 })).toBe(state);
    expect(applySudoku(state, { t: 'note', cell: firstEmpty(state), digit: 10 })).toBe(state);
  });

  it('toggles notes and blocks notes on filled cells', () => {
    const state = freshState();
    const cell = firstEmpty(state);
    const once = applySudoku(state, { t: 'note', cell, digit: 3 });
    expect(notedDigits(once.notes[cell] as number)).toEqual([3]);
    const twice = applySudoku(once, { t: 'note', cell, digit: 3 });
    expect(notedDigits(twice.notes[cell] as number)).toEqual([]);
    const filled = applySudoku(state, { t: 'set', cell, digit: 4 });
    expect(applySudoku(filled, { t: 'note', cell, digit: 5 })).toBe(filled);
  });

  it('setting a digit erases it from peer notes and clears own notes', () => {
    const state = freshState();
    const cell = firstEmpty(state);
    // Find an empty peer to note on (same row shares peers).
    const peer = state.puzzle.findIndex(
      (v, i) => v === 0 && i !== cell && Math.floor(i / 9) === Math.floor(cell / 9),
    );
    let s = applySudoku(state, { t: 'note', cell: peer, digit: 6 });
    s = applySudoku(s, { t: 'note', cell, digit: 6 });
    s = applySudoku(s, { t: 'set', cell, digit: 6 });
    expect(notedDigits(s.notes[cell] as number)).toEqual([]);
    expect(notedDigits(s.notes[peer] as number)).toEqual([]);
  });

  it('solved flips true exactly when the grid matches the solution', () => {
    let state = freshState();
    for (let cell = 0; cell < 81; cell++) {
      if ((state.puzzle[cell] as number) !== 0) continue;
      state = applySudoku(state, { t: 'set', cell, digit: state.solution[cell] as number });
    }
    expect(state.solved).toBe(true);
    // Clearing any cell un-solves it.
    const cell = firstEmpty(state);
    expect(applySudoku(state, { t: 'clear', cell }).solved).toBe(false);
  });

  it('a wrong digit never counts as solved', () => {
    let state = freshState();
    for (let cell = 0; cell < 81; cell++) {
      if ((state.puzzle[cell] as number) !== 0) continue;
      const right = state.solution[cell] as number;
      const last = state.puzzle.slice(cell + 1).every((v) => v !== 0);
      const digit = last ? (right === 9 ? 1 : right + 1) : right;
      state = applySudoku(state, { t: 'set', cell, digit });
    }
    expect(state.solved).toBe(false);
  });
});

describe('helpers', () => {
  it('digitCounts tallies placements', () => {
    const state = freshState();
    const counts = digitCounts(state.grid);
    const total = counts.slice(1).reduce((a, b) => a + b, 0);
    expect(total).toBe(state.puzzle.filter((v) => v !== 0).length);
  });
});
