// The pure machine: remaining time is arithmetic over an injected clock, so
// pausing, resuming, throttled ticks, and early ends all fall out of algebra.
import { describe, expect, it } from 'vitest';
import {
  elapsedMs,
  formatRemaining,
  isDone,
  pauseSit,
  remainingMs,
  resumeSit,
  startSit,
} from '../src/index';

const MIN = 60_000;

describe('sit timer', () => {
  it('counts down from the full duration', () => {
    const t = startSit(10 * MIN, 1000);
    expect(remainingMs(t, 1000)).toBe(10 * MIN);
    expect(formatRemaining(t, 1000)).toBe('10:00');
    expect(remainingMs(t, 1000 + 3 * MIN)).toBe(7 * MIN);
    expect(isDone(t, 1000 + 10 * MIN)).toBe(true);
    expect(remainingMs(t, 1000 + 11 * MIN)).toBe(0); // clamped, never negative
  });

  it('pause freezes the clock; resume banks the paused span', () => {
    let t = startSit(10 * MIN, 0);
    t = pauseSit(t, 2 * MIN);
    expect(remainingMs(t, 9 * MIN)).toBe(8 * MIN); // frozen while paused
    t = resumeSit(t, 5 * MIN); // 3 minutes paused
    expect(remainingMs(t, 5 * MIN)).toBe(8 * MIN);
    expect(isDone(t, 13 * MIN)).toBe(true); // 10 sitting + 3 paused
  });

  it('pause/resume are idempotent on the wrong phase', () => {
    const t = startSit(MIN, 0);
    expect(resumeSit(t, 10)).toBe(t);
    const p = pauseSit(t, 10);
    expect(pauseSit(p, 20)).toBe(p);
  });

  it('elapsed reports the time actually sat', () => {
    let t = startSit(10 * MIN, 0);
    t = pauseSit(t, 2 * MIN);
    t = resumeSit(t, 6 * MIN);
    expect(elapsedMs(t, 7 * MIN)).toBe(3 * MIN);
  });

  it('formatRemaining ceils so the first frame shows the full time', () => {
    const t = startSit(5 * MIN, 0);
    expect(formatRemaining(t, 1)).toBe('5:00');
    expect(formatRemaining(t, 1001)).toBe('4:59');
    expect(formatRemaining(t, 5 * MIN)).toBe('0:00');
  });
});
