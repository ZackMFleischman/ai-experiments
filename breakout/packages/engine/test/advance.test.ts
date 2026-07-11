import { describe, expect, it } from 'vitest';
import {
  BALL,
  BRICKS,
  PADDLE,
  START_LIVES,
  WORLD,
  advance,
  bricksRemaining,
  initBreakout,
  type BreakoutAction,
  type BreakoutState,
} from '../src/index.js';

const SEED = 42;

function run(state: BreakoutState, ticks: number, actions: BreakoutAction[] = []): BreakoutState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = advance(s, i === 0 ? actions : []);
  return s;
}

describe('initBreakout', () => {
  it('starts serving, centered, with a level-1 wall', () => {
    const s = initBreakout({ seed: SEED });
    expect(s.phase).toBe('serving');
    expect(s.lives).toBe(START_LIVES);
    expect(s.level).toBe(1);
    expect(s.ball).toBeNull();
    expect(s.paddleX).toBe(WORLD.width / 2);
    expect(s.bricks).toHaveLength(BRICKS.cols * BRICKS.rows);
    expect(bricksRemaining(s)).toBeGreaterThan(0);
    // Level 1 uses 3 rows.
    expect(s.bricks.slice(3 * BRICKS.cols).every((hp) => hp === 0)).toBe(true);
  });
});

describe('paddle', () => {
  it('keyboard hold moves until released, clamped to the walls', () => {
    let s = initBreakout({ seed: SEED });
    s = run(s, 200, [{ t: 'move', dir: -1 }]);
    expect(s.paddleX).toBe(PADDLE.width / 2); // pinned to the left wall
    s = advance(s, [{ t: 'move', dir: 0 }]);
    const stopped = s.paddleX;
    s = run(s, 10);
    expect(s.paddleX).toBe(stopped);
  });

  it('pointer target is approached at bounded speed', () => {
    let s = initBreakout({ seed: SEED });
    s = advance(s, [{ t: 'target', x: 90 }]);
    expect(s.paddleX).toBe(WORLD.width / 2 + PADDLE.targetSpeed);
    s = run(s, 30);
    expect(s.paddleX).toBe(90);
  });
});

describe('serving and flight', () => {
  it('serve launches upward at level speed; ball stays in the world', () => {
    let s = initBreakout({ seed: SEED });
    s = advance(s, [{ t: 'serve' }]);
    expect(s.phase).toBe('live');
    expect(s.ball).not.toBeNull();
    expect(s.ball!.vy).toBeLessThan(0);
    expect(Math.hypot(s.ball!.vx, s.ball!.vy)).toBeCloseTo(BALL.baseSpeed, 6);
    for (let i = 0; i < 2000 && s.ball; i++) {
      s = advance(s, []);
      if (s.ball) {
        expect(s.ball.x).toBeGreaterThanOrEqual(BALL.radius - 1e-9);
        expect(s.ball.x).toBeLessThanOrEqual(WORLD.width - BALL.radius + 1e-9);
        expect(s.ball.y).toBeGreaterThanOrEqual(BALL.radius - 1e-9);
      }
    }
  });

  it('a serve eventually breaks bricks and scores', () => {
    let s = initBreakout({ seed: SEED });
    s = advance(s, [{ t: 'serve' }]);
    const before = bricksRemaining(s);
    for (let i = 0; i < 3000 && s.phase === 'live'; i++) s = advance(s, []);
    // The ball flew long enough to have hit the wall of bricks above.
    expect(s.score).toBeGreaterThan(0);
    expect(bricksRemaining(s)).toBeLessThan(before);
  });

  it('an unattended ball falls out: life lost, back to serving', () => {
    let s = initBreakout({ seed: SEED });
    // Park the paddle in a corner so the serve can miss it.
    s = advance(s, [{ t: 'move', dir: -1 }]);
    s = run(s, 60);
    s = advance(s, [{ t: 'move', dir: 0 }, { t: 'serve' }]);
    for (let i = 0; i < 20000 && s.lives === START_LIVES; i++) s = advance(s, []);
    expect(s.lives).toBe(START_LIVES - 1);
    expect(s.phase).toBe('serving');
    expect(s.ball).toBeNull();
  });

  it('three lost balls end the game', () => {
    let s = initBreakout({ seed: SEED });
    for (let deaths = 0; deaths < START_LIVES; deaths++) {
      s = advance(s, [{ t: 'move', dir: deaths % 2 ? 1 : -1 }]);
      s = run(s, 60);
      s = advance(s, [{ t: 'move', dir: 0 }, { t: 'serve' }]);
      for (let i = 0; i < 30000 && s.phase === 'live'; i++) s = advance(s, []);
      if (s.phase === 'game-over') break;
    }
    expect(s.phase).toBe('game-over');
    expect(s.lives).toBe(0);
    expect(s.ball).toBeNull();
    // serve is inert after the end.
    expect(advance(s, [{ t: 'serve' }]).phase).toBe('game-over');
  });
});

describe('level clear', () => {
  it('clearing the wall parks the ball; serve deals the next, denser level', () => {
    let s = initBreakout({ seed: SEED });
    // Leave a single brick standing.
    const index = s.bricks.findIndex((hp) => hp > 0);
    s = {
      ...s,
      bricks: s.bricks.map((hp, i) => (i === index ? 1 : 0)),
    };
    s = advance(s, [{ t: 'serve' }]);
    for (let i = 0; i < 60000 && s.phase === 'live'; i++) {
      // Track the ball so it never falls out.
      const x = s.ball?.x ?? s.paddleX;
      s = advance(s, [{ t: 'target', x }]);
    }
    expect(s.phase).toBe('level-cleared');
    expect(s.ball).toBeNull();
    const score = s.score;
    s = advance(s, [{ t: 'serve' }]);
    expect(s.phase).toBe('serving');
    expect(s.level).toBe(2);
    expect(s.score).toBe(score); // score carries across levels
    expect(bricksRemaining(s)).toBeGreaterThan(0);
  });
});
