import { describe, expect, it } from 'vitest';
import { HighScoreStore, type KeyValueStorage } from '../src/index.js';

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

class ThrowingStorage extends FakeStorage {
  override setItem(): void {
    throw new Error('quota exceeded');
  }
}

describe('HighScoreStore', () => {
  it('records scores and reports the best', () => {
    const store = new HighScoreStore('t:scores', new FakeStorage());
    expect(store.best()).toBeNull();
    expect(store.record({ score: 100, day: '2026-07-10' })).toBe(true);
    expect(store.record({ score: 50, day: '2026-07-10' })).toBe(false);
    expect(store.record({ score: 200, day: '2026-07-11' })).toBe(true);
    expect(store.best()?.score).toBe(200);
    expect(store.scores()).toHaveLength(3);
  });

  it('ties are not a new best; the first holder keeps top rank', () => {
    const store = new HighScoreStore('t:scores', new FakeStorage());
    store.record({ score: 100, day: '2026-07-10' });
    expect(store.record({ score: 100, day: '2026-07-11' })).toBe(false);
    expect(store.top(2)[0]?.day).toBe('2026-07-10');
  });

  it('buckets are independent', () => {
    const store = new HighScoreStore('t:scores', new FakeStorage());
    store.record({ score: 10, day: '2026-07-10', bucket: 'easy' });
    expect(store.record({ score: 5, day: '2026-07-10', bucket: 'hard' })).toBe(
      true,
    );
    expect(store.best('easy')?.score).toBe(10);
    expect(store.best('hard')?.score).toBe(5);
    expect(store.top(10, 'easy')).toHaveLength(1);
  });

  it('top sorts highest first and bounds the count', () => {
    const store = new HighScoreStore('t:scores', new FakeStorage());
    for (const score of [3, 9, 1, 7]) {
      store.record({ score, day: '2026-07-10' });
    }
    expect(store.top(3).map((r) => r.score)).toEqual([9, 7, 3]);
  });

  it('survives corrupt storage', () => {
    const storage = new FakeStorage();
    storage.setItem('t:scores', '{not json');
    const store = new HighScoreStore('t:scores', storage);
    expect(store.scores()).toEqual([]);
    storage.setItem('t:scores', JSON.stringify([{ score: 'NaN' }, { score: 5, day: 'd' }]));
    expect(store.scores()).toEqual([{ score: 5, day: 'd' }]);
  });

  it('storage writes that throw never interrupt play', () => {
    const store = new HighScoreStore('t:scores', new ThrowingStorage());
    expect(() => store.record({ score: 1, day: '2026-07-10' })).not.toThrow();
  });
});
