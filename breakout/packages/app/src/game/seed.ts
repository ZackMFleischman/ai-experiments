// The one place randomness enters the app; the engine itself stays
// deterministic per seed (same discipline as sudoku's randomOptions).
import { hashSeed, type BreakoutOptions } from '@breakout/engine';

export function newGameOptions(): BreakoutOptions {
  return { seed: hashSeed(`game:${Date.now()}:${Math.random()}`) };
}
