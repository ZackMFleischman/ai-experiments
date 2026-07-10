// The app's single SoloSession: engine reducer folded over the persisted
// local log. init() regenerates the puzzle from the seed — memoized because
// SoloSession refolds from init on every undo.
import { SoloSession, StatsStore, dayKey, hashSeed, type KeyValueStorage } from '@parlor/solo';
import {
  applySudoku,
  initSudoku,
  type Difficulty,
  type SudokuEntry,
  type SudokuOptions,
  type SudokuState,
} from '@sudoku/engine';

export type Session = SoloSession<SudokuOptions, SudokuEntry, SudokuState>;

const initCache = new Map<string, SudokuState>();

function memoizedInit(options: SudokuOptions): SudokuState {
  const key = `${options.seed}:${options.difficulty}`;
  let state = initCache.get(key);
  if (!state) {
    state = initSudoku(options);
    initCache.set(key, state);
    if (initCache.size > 4) {
      const oldest = initCache.keys().next().value as string;
      initCache.delete(oldest);
    }
  }
  return state;
}

export function createSession(storage: KeyValueStorage): Session {
  return new SoloSession({ init: memoizedInit, apply: applySudoku }, 'sudoku:game', storage);
}

export function createStats(storage: KeyValueStorage): StatsStore {
  return new StatsStore('sudoku:stats', storage);
}

/** A fresh random game's options. */
export function randomOptions(difficulty: Difficulty): SudokuOptions {
  // Seed from the clock — the one place randomness enters; the engine itself
  // stays deterministic per seed.
  return { seed: hashSeed(`random:${Date.now()}:${Math.random()}`), difficulty };
}

/** Today's daily puzzle — same for every player on the same local date. */
export function dailyOptions(now: Date): SudokuOptions {
  const day = dayKey(now);
  return { seed: hashSeed(`daily:${day}`), difficulty: 'medium', daily: day };
}
