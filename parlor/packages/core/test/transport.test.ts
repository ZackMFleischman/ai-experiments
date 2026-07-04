// T3.4 (lex): the GameTransport seam + local/localStorage implementations
// ported from hive. Storage is injected (KeyValueStorage) — @parlor/core
// never touches the DOM.
import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../src/transport.js';
import { LocalStorageTransport, LocalTransport } from '../src/transport.js';

interface Opts {
  name: string;
}
type Entry = { v: number };

class MemoryStorage implements KeyValueStorage {
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

describe('LocalTransport', () => {
  it('accepts sequential submits and rejects a stale index', async () => {
    const t = new LocalTransport<Opts, Entry>({ name: 'a' });
    await t.submit({ v: 1 }, 0);
    await t.submit({ v: 2 }, 1);
    await expect(t.submit({ v: 3 }, 1)).rejects.toThrow(/concurrency/);
    expect((await t.load())?.log).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it('reset replaces the game', async () => {
    const t = new LocalTransport<Opts, Entry>({ name: 'a' });
    await t.submit({ v: 1 }, 0);
    await t.reset({ name: 'b' });
    const stored = await t.load();
    expect(stored?.options).toEqual({ name: 'b' });
    expect(stored?.log).toEqual([]);
  });
});

describe('LocalStorageTransport', () => {
  it('persists submits and restores them in a new instance', async () => {
    const storage = new MemoryStorage();
    const first = new LocalStorageTransport<Opts, Entry>({ name: 'a' }, 'test.key', storage);
    await first.submit({ v: 1 }, 0);
    await first.submit({ v: 2 }, 1);
    const second = new LocalStorageTransport<Opts, Entry>({ name: 'fresh' }, 'test.key', storage);
    const stored = await second.load();
    expect(stored?.options).toEqual({ name: 'a' });
    expect(stored?.log).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it('ignores corrupt storage instead of crashing', async () => {
    const storage = new MemoryStorage();
    storage.setItem('test.key', '{not json');
    const t = new LocalStorageTransport<Opts, Entry>({ name: 'fallback' }, 'test.key', storage);
    expect((await t.load())?.options).toEqual({ name: 'fallback' });
  });

  it('keeps playing when storage writes throw (quota)', async () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    const t = new LocalStorageTransport<Opts, Entry>({ name: 'a' }, 'test.key', storage);
    await t.submit({ v: 1 }, 0);
    expect((await t.load())?.log).toEqual([{ v: 1 }]);
  });

  it('validates the stored shape before trusting it', async () => {
    const storage = new MemoryStorage();
    storage.setItem('test.key', JSON.stringify({ options: 5, log: 'no' }));
    const t = new LocalStorageTransport<Opts, Entry>({ name: 'fallback' }, 'test.key', storage);
    expect((await t.load())?.options).toEqual({ name: 'fallback' });
  });
});
