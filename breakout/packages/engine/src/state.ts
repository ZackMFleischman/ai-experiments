// The world and its state. Everything simulates in a fixed 120×160 unit
// space at 120 ticks/s; the app letterboxes that into whatever rectangle
// layout gives it (@parlor/arcade). State is a plain JSON value — the fold
// in advance.ts is the only thing that changes it.

export const WORLD = {
  width: 120,
  height: 160,
  /** Simulation rate — the app's fixed loop must step at 1000/tps ms. */
  ticksPerSecond: 120,
} as const;

export const PADDLE = {
  /** Top edge of the paddle. */
  y: 150,
  height: 3,
  width: 24,
  /** Units per tick while a keyboard direction is held. */
  speed: 2.0,
  /** Units per tick toward a pointer target. */
  targetSpeed: 2.6,
} as const;

export const BALL = {
  radius: 2,
  /** Serve speed at level 1, units per tick. */
  baseSpeed: 0.55,
  /** Per-level speed multiplier, capped. */
  levelFactor: 1.08,
  maxSpeed: 0.95,
  /** Widest serve/paddle bounce angle from vertical, radians. */
  maxAngle: 1.0,
} as const;

export const BRICKS = {
  cols: 8,
  /** Row pitch grid the layouts fill from the top. */
  rows: 6,
  /** Cell pitch; bricks render inset, collide full-cell. */
  cellWidth: 14,
  cellHeight: 7,
  left: 4,
  top: 18,
} as const;

export const START_LIVES = 3;
export const POINTS_PER_HIT = 10;

export interface BreakoutOptions {
  seed: number;
}

export type Phase = 'serving' | 'live' | 'level-cleared' | 'game-over';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface BreakoutState {
  /** Ticks folded so far — the trace clock. */
  tick: number;
  phase: Phase;
  level: number;
  score: number;
  lives: number;
  /** Paddle center. */
  paddleX: number;
  /** Keyboard hold: -1 | 0 | 1. */
  moveDir: number;
  /** Pointer target for the paddle center, or null. */
  targetX: number | null;
  /** Null while serving (the ball rides the paddle). */
  ball: Ball | null;
  /** Hit points per brick cell, row-major cols×rows; 0 = gone. */
  bricks: number[];
  /** mulberry32 cursor — all randomness is folded state. */
  rng: number;
}

/** Ball speed for a level. */
export function levelSpeed(level: number): number {
  return Math.min(
    BALL.baseSpeed * BALL.levelFactor ** (level - 1),
    BALL.maxSpeed,
  );
}

/** Brick cell geometry, for collisions and rendering alike. */
export function brickRect(index: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const col = index % BRICKS.cols;
  const row = Math.floor(index / BRICKS.cols);
  return {
    x: BRICKS.left + col * BRICKS.cellWidth,
    y: BRICKS.top + row * BRICKS.cellHeight,
    width: BRICKS.cellWidth,
    height: BRICKS.cellHeight,
  };
}

export function bricksRemaining(state: BreakoutState): number {
  return state.bricks.reduce((n, hp) => n + (hp > 0 ? 1 : 0), 0);
}
