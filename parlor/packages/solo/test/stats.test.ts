import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../src/index.js';
import { StatsStore, computeStreaks } from '../src/index.js';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('computeStreaks', () => {
  it('empty days → no streaks', () => {
    expect(computeStreaks([], '2026-07-10')).toEqual({ current: 0, best: 0 });
  });

  it('counts consecutive days and survives month boundaries', () => {
    const days = ['2026-06-29', '2026-06-30', '2026-07-01'];
    expect(computeStreaks(days, '2026-07-01')).toEqual({ current: 3, best: 3 });
  });

  it('a streak ending yesterday is still alive today', () => {
    expect(computeStreaks(['2026-07-08', '2026-07-09'], '2026-07-10')).toEqual({
      current: 2,
      best: 2,
    });
  });

  it('a missed day breaks the current streak but not the best', () => {
    const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-08'];
    expect(computeStreaks(days, '2026-07-10')).toEqual({ current: 0, best: 3 });
  });

  it('duplicate days count once', () => {
    expect(computeStreaks(['2026-07-09', '2026-07-09', '2026-07-10'], '2026-07-10')).toEqual({
      current: 2,
      best: 2,
    });
  });
});

describe('StatsStore', () => {
  const store = (storage = new FakeStorage()) => new StatsStore('stats', storage);

  it('records and aggregates results', () => {
    const s = store();
    s.record({ day: '2026-07-09', durationMs: 300_000, won: true, bucket: 'easy' });
    s.record({ day: '2026-07-10', durationMs: 200_000, won: true, bucket: 'easy' });
    s.record({ day: '2026-07-10', durationMs: 500_000, won: false, bucket: 'hard' });
    const summary = s.summary('2026-07-10');
    expect(summary.played).toBe(3);
    expect(summary.won).toBe(2);
    expect(summary.bestDurationMs).toBe(200_000);
    expect(summary.currentStreak).toBe(2);
    expect(summary.bestStreak).toBe(2);
  });

  it('filters by bucket', () => {
    const s = store();
    s.record({ day: '2026-07-10', durationMs: 100, won: true, bucket: 'easy' });
    s.record({ day: '2026-07-10', durationMs: 200, won: false, bucket: 'hard' });
    expect(s.summary('2026-07-10', 'easy')).toMatchObject({ played: 1, won: 1 });
    expect(s.summary('2026-07-10', 'hard')).toMatchObject({ played: 1, won: 0, bestDurationMs: null });
  });

  it('no wins → no best time, no streaks', () => {
    const s = store();
    s.record({ day: '2026-07-10', durationMs: 100, won: false });
    expect(s.summary('2026-07-10')).toEqual({
      played: 1,
      won: 0,
      bestDurationMs: null,
      currentStreak: 0,
      bestStreak: 0,
    });
  });

  it('survives corrupt storage and skips malformed records', () => {
    const storage = new FakeStorage();
    storage.setItem('stats', '{nope');
    expect(store(storage).results()).toEqual([]);
    storage.setItem('stats', JSON.stringify([{ day: '2026-07-10', durationMs: 1, won: true }, { junk: true }]));
    expect(store(storage).results()).toHaveLength(1);
  });

  it('caps stored results', () => {
    const s = store();
    for (let i = 0; i < 2100; i++) {
      s.record({ day: '2026-07-10', durationMs: i, won: false });
    }
    expect(s.results().length).toBe(2000);
    // Oldest results were dropped, newest kept.
    expect(s.results()[s.results().length - 1]?.durationMs).toBe(2099);
  });
});
