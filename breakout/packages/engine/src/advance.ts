// The tick fold: advance(state, actions) is the entire game. Pure — same
// state + same actions is the same next state, forever — which is what the
// archetype's key gate tests (same seed + same input trace → identical end
// state). One tick moves the paddle, integrates the ball, and resolves at
// most one brick hit (the step is far smaller than a brick, so multi-hit
// ticks can't occur at legal speeds).

import { generateLevel } from './levels.js';
import { nextRand } from './rng.js';
import {
  BALL,
  BRICKS,
  PADDLE,
  POINTS_PER_HIT,
  START_LIVES,
  WORLD,
  bricksRemaining,
  levelSpeed,
  type Ball,
  type BreakoutOptions,
  type BreakoutState,
} from './state.js';

export type BreakoutAction =
  | { t: 'move'; dir: -1 | 0 | 1 }
  | { t: 'target'; x: number }
  | { t: 'serve' };

export function initBreakout(options: BreakoutOptions): BreakoutState {
  const layout = generateLevel(1, options.seed >>> 0);
  return {
    tick: 0,
    phase: 'serving',
    level: 1,
    score: 0,
    lives: START_LIVES,
    paddleX: WORLD.width / 2,
    moveDir: 0,
    targetX: null,
    ball: null,
    bricks: layout.bricks,
    rng: layout.rng,
  };
}

export function advance(
  state: BreakoutState,
  actions: readonly BreakoutAction[],
): BreakoutState {
  let next: BreakoutState = { ...state };
  for (const action of actions) {
    next = applyAction(next, action);
  }
  next.paddleX = movePaddle(next);
  if (next.phase === 'live' && next.ball) {
    stepBall(next);
  }
  next.tick += 1;
  return next;
}

function applyAction(
  state: BreakoutState,
  action: BreakoutAction,
): BreakoutState {
  switch (action.t) {
    case 'move':
      return { ...state, moveDir: action.dir, targetX: null };
    case 'target':
      return { ...state, targetX: action.x, moveDir: 0 };
    case 'serve':
      return serve(state);
  }
}

function serve(state: BreakoutState): BreakoutState {
  if (state.phase === 'serving') {
    const [roll, rng] = nextRand(state.rng);
    // Off-vertical serve — never straight up (a vertical ball can live in a
    // cleared column forever).
    const side = roll < 0.5 ? -1 : 1;
    const angle = side * (0.25 + Math.abs(roll * 2 - 1) * 0.45);
    const speed = levelSpeed(state.level);
    const ball: Ball = {
      x: state.paddleX,
      y: PADDLE.y - BALL.radius,
      vx: speed * Math.sin(angle),
      vy: -speed * Math.cos(angle),
    };
    return { ...state, phase: 'live', ball, rng };
  }
  if (state.phase === 'level-cleared') {
    const level = state.level + 1;
    const layout = generateLevel(level, state.rng);
    return {
      ...state,
      phase: 'serving',
      level,
      bricks: layout.bricks,
      rng: layout.rng,
      ball: null,
    };
  }
  return state;
}

function movePaddle(state: BreakoutState): number {
  const half = PADDLE.width / 2;
  let x = state.paddleX;
  if (state.targetX !== null) {
    const delta = state.targetX - x;
    x += Math.max(-PADDLE.targetSpeed, Math.min(PADDLE.targetSpeed, delta));
  } else if (state.moveDir !== 0) {
    x += state.moveDir * PADDLE.speed;
  }
  return Math.max(half, Math.min(WORLD.width - half, x));
}

/** Integrate + collide one tick. Mutates the (already-copied) state. */
function stepBall(state: BreakoutState): void {
  const ball = { ...(state.ball as Ball) };
  state.ball = ball;
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Walls.
  if (ball.x < BALL.radius) {
    ball.x = BALL.radius;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x > WORLD.width - BALL.radius) {
    ball.x = WORLD.width - BALL.radius;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y < BALL.radius) {
    ball.y = BALL.radius;
    ball.vy = Math.abs(ball.vy);
  }

  // Paddle: only a falling ball, only while its bottom is inside the
  // paddle band — the bounce angle comes from where it lands.
  if (
    ball.vy > 0 &&
    ball.y + BALL.radius >= PADDLE.y &&
    ball.y + BALL.radius <= PADDLE.y + PADDLE.height &&
    Math.abs(ball.x - state.paddleX) <= PADDLE.width / 2 + BALL.radius
  ) {
    const rel = Math.max(
      -1,
      Math.min(1, (ball.x - state.paddleX) / (PADDLE.width / 2)),
    );
    const angle = rel * BALL.maxAngle;
    const speed = Math.hypot(ball.vx, ball.vy);
    ball.vx = speed * Math.sin(angle);
    ball.vy = -speed * Math.cos(angle);
    ball.y = PADDLE.y - BALL.radius;
  }

  // Bricks: vertical probes first (top/bottom of the ball), then horizontal.
  const vertical =
    brickAt(state, ball.x, ball.y - BALL.radius) ??
    brickAt(state, ball.x, ball.y + BALL.radius);
  const hit =
    vertical ?? brickAt(state, ball.x - BALL.radius, ball.y) ??
    brickAt(state, ball.x + BALL.radius, ball.y);
  if (hit !== null && hit !== undefined) {
    state.bricks = [...state.bricks];
    state.bricks[hit] = (state.bricks[hit] as number) - 1;
    state.score += POINTS_PER_HIT;
    if (vertical !== null && vertical !== undefined) {
      ball.vy = -ball.vy;
    } else {
      ball.vx = -ball.vx;
    }
    if (bricksRemaining(state) === 0) {
      state.phase = 'level-cleared';
      state.ball = null;
      return;
    }
  }

  // The floor.
  if (ball.y - BALL.radius > WORLD.height) {
    state.lives -= 1;
    state.ball = null;
    state.phase = state.lives <= 0 ? 'game-over' : 'serving';
  }
}

/** Index of a live brick containing the point, else null. */
function brickAt(state: BreakoutState, x: number, y: number): number | null {
  const col = Math.floor((x - BRICKS.left) / BRICKS.cellWidth);
  const row = Math.floor((y - BRICKS.top) / BRICKS.cellHeight);
  if (col < 0 || col >= BRICKS.cols || row < 0 || row >= BRICKS.rows) {
    return null;
  }
  const index = row * BRICKS.cols + col;
  return (state.bricks[index] ?? 0) > 0 ? index : null;
}
