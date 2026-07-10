import { describe, expect, it } from 'vitest';
import { createFixedLoop, type LoopDriver } from '../src/index.js';

/** A hand-cranked driver: tests own the clock and fire frames explicitly. */
function fakeDriver() {
  let time = 0;
  let next: (() => void) | null = null;
  let cancelled = 0;
  const driver: LoopDriver = {
    now: () => time,
    requestFrame(cb) {
      next = cb;
      return 1;
    },
    cancelFrame() {
      cancelled += 1;
      next = null;
    },
  };
  return {
    driver,
    /** Advance the clock and paint one frame. */
    frame(deltaMs: number): void {
      time += deltaMs;
      const cb = next;
      next = null;
      cb?.();
    },
    get cancelled() {
      return cancelled;
    },
    get scheduled() {
      return next !== null;
    },
  };
}

function makeLoop(driver: LoopDriver, stepMs = 10, maxTicksPerFrame?: number) {
  const updates: number[] = [];
  const alphas: number[] = [];
  const loop = createFixedLoop({
    stepMs,
    ...(maxTicksPerFrame === undefined ? {} : { maxTicksPerFrame }),
    update: (tick) => updates.push(tick),
    render: (alpha) => alphas.push(alpha),
    driver,
  });
  return { loop, updates, alphas };
}

describe('createFixedLoop', () => {
  it('advances one tick per stepMs of elapsed time', () => {
    const clock = fakeDriver();
    const { loop, updates } = makeLoop(clock.driver);
    loop.start();
    clock.frame(10);
    clock.frame(10);
    clock.frame(10);
    expect(updates).toEqual([0, 1, 2]);
    expect(loop.tick).toBe(3);
  });

  it('is independent of frame boundaries: irregular frames, same ticks', () => {
    const regular = fakeDriver();
    const a = makeLoop(regular.driver);
    a.loop.start();
    for (let i = 0; i < 6; i++) regular.frame(10);

    const irregular = fakeDriver();
    const b = makeLoop(irregular.driver);
    b.loop.start();
    for (const delta of [3, 17, 25, 1, 4, 10]) irregular.frame(delta); // = 60
    expect(b.updates).toEqual(a.updates);
  });

  it('carries fractional remainders across frames', () => {
    const clock = fakeDriver();
    const { loop, updates } = makeLoop(clock.driver);
    loop.start();
    clock.frame(15); // 1 tick, 5ms banked
    expect(updates).toEqual([0]);
    clock.frame(5); // banked 10ms → tick
    expect(updates).toEqual([0, 1]);
  });

  it('clamps runaway frames instead of spiraling', () => {
    const clock = fakeDriver();
    const { loop, updates } = makeLoop(clock.driver, 10, 5);
    loop.start();
    clock.frame(10_000); // debugger pause / background tab
    expect(updates).toEqual([0, 1, 2, 3, 4]);
  });

  it('renders every frame with alpha in [0, 1)', () => {
    const clock = fakeDriver();
    const { loop, alphas } = makeLoop(clock.driver);
    loop.start();
    for (const delta of [4, 9, 13, 22]) clock.frame(delta);
    expect(alphas).toHaveLength(4);
    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('pause freezes the simulation; resume never bursts', () => {
    const clock = fakeDriver();
    const { loop, updates } = makeLoop(clock.driver);
    loop.start();
    clock.frame(10);
    loop.pause();
    expect(loop.paused).toBe(true);
    clock.frame(500);
    clock.frame(500);
    expect(updates).toEqual([0]);
    loop.resume();
    clock.frame(10);
    expect(updates).toEqual([0, 1]); // one tick for 10ms — no catch-up burst
  });

  it('stop cancels the scheduled frame; start begins a fresh run', () => {
    const clock = fakeDriver();
    const { loop, updates } = makeLoop(clock.driver);
    loop.start();
    clock.frame(20);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(clock.cancelled).toBe(1);
    expect(clock.scheduled).toBe(false);
    loop.start();
    clock.frame(10);
    expect(updates).toEqual([0, 1, 0]); // tick reset to 0 on start
  });

  it('start is idempotent while running', () => {
    const clock = fakeDriver();
    const { loop, updates } = makeLoop(clock.driver);
    loop.start();
    clock.frame(10);
    loop.start();
    clock.frame(10);
    expect(updates).toEqual([0, 1]); // no reset, no double frames
  });
});
