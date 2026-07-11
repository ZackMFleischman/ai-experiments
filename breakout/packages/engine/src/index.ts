// @breakout/engine — the pure, deterministic rules kernel: a fixed-tick
// fold advance(state, actions) over a 120×160 world. Zero dependencies, no
// DOM, no clock, no Math.random (the mulberry32 cursor lives in the state).
// The app drives it from @parlor/arcade's fixed loop; tests drive it from
// recorded input traces.

export {
  advance,
  initBreakout,
  type BreakoutAction,
} from './advance.js';

export { generateLevel, rowsForLevel, type LevelLayout } from './levels.js';

export { hashSeed, nextRand } from './rng.js';

export {
  BALL,
  BRICKS,
  PADDLE,
  POINTS_PER_HIT,
  START_LIVES,
  WORLD,
  brickRect,
  bricksRemaining,
  levelSpeed,
  type Ball,
  type BreakoutOptions,
  type BreakoutState,
  type Phase,
} from './state.js';
