import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStorage, SoloSessionConfig } from '../src/index.js';
import { SoloSession } from '../src/index.js';

// A trivial counting game: options pick a start value, entries add to it.
type Options = { start: number };
type Entry = { add: number };
type State = { total: number; moves: number };

const config: SoloSessionConfig<Options, Entry, State> = {
  init: (options) => ({ total: options.start, moves: 0 }),
  apply: (state, entry) => ({ total: state.total + entry.add, moves: state.moves + 1 }),
};

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
    throw new Error('quota');
  }
}

describe('SoloSession', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
  });

  const session = () => new SoloSession(config, 'game', storage);

  it('starts fresh and folds submitted entries', () => {
    const s = session();
    expect(s.state).toBeNull();
    s.start({ start: 10 });
    s.submit({ add: 5 });
    s.submit({ add: 2 });
    expect(s.state).toEqual({ total: 17, moves: 2 });
    expect(s.log).toHaveLength(2);
  });

  it('resumes from storage across instances', () => {
    const first = session();
    first.start({ start: 1 });
    first.submit({ add: 3 });
    const second = session();
    expect(second.options).toEqual({ start: 1 });
    expect(second.state).toEqual({ total: 4, moves: 1 });
  });

  it('undo/redo move the cursor without losing the log', () => {
    const s = session();
    s.start({ start: 0 });
    s.submit({ add: 1 });
    s.submit({ add: 2 });
    expect(s.undo()).toBe(true);
    expect(s.state).toEqual({ total: 1, moves: 1 });
    expect(s.canRedo).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.state).toEqual({ total: 3, moves: 2 });
    expect(s.canRedo).toBe(false);
  });

  it('undo/redo state survives a reload (cursor persists)', () => {
    const s = session();
    s.start({ start: 0 });
    s.submit({ add: 1 });
    s.submit({ add: 2 });
    s.undo();
    const resumed = session();
    expect(resumed.state).toEqual({ total: 1, moves: 1 });
    expect(resumed.canRedo).toBe(true);
    expect(resumed.redo()).toBe(true);
    expect(resumed.state).toEqual({ total: 3, moves: 2 });
  });

  it('submitting after undo drops the redo tail', () => {
    const s = session();
    s.start({ start: 0 });
    s.submit({ add: 1 });
    s.submit({ add: 2 });
    s.undo();
    s.submit({ add: 10 });
    expect(s.state).toEqual({ total: 11, moves: 2 });
    expect(s.canRedo).toBe(false);
    expect(s.redo()).toBe(false);
  });

  it('undo at the start and redo at the tip are refused', () => {
    const s = session();
    s.start({ start: 0 });
    expect(s.undo()).toBe(false);
    expect(s.redo()).toBe(false);
  });

  it('submit/undo/redo before start are no-ops', () => {
    const s = session();
    s.submit({ add: 1 });
    expect(s.state).toBeNull();
    expect(s.undo()).toBe(false);
    expect(s.redo()).toBe(false);
  });

  it('clear forgets the stored game', () => {
    const s = session();
    s.start({ start: 5 });
    s.submit({ add: 1 });
    s.clear();
    expect(s.state).toBeNull();
    expect(session().state).toBeNull();
  });

  it('notifies subscribers on every change and honors unsubscribe', () => {
    const s = session();
    let calls = 0;
    const unsubscribe = s.subscribe(() => calls++);
    s.start({ start: 0 });
    s.submit({ add: 1 });
    s.undo();
    s.redo();
    expect(calls).toBe(4);
    unsubscribe();
    s.undo();
    expect(calls).toBe(4);
  });

  it('ignores corrupt stored JSON', () => {
    storage.setItem('game', '{not json');
    expect(session().state).toBeNull();
  });

  it('ignores stored games with an out-of-range cursor', () => {
    storage.setItem('game', JSON.stringify({ options: { start: 0 }, log: [], cursor: 3 }));
    expect(session().state).toBeNull();
  });

  it('discards a stored game whose entries no longer fold', () => {
    const throwing: SoloSessionConfig<Options, Entry, State> = {
      init: config.init,
      apply: () => {
        throw new Error('corrupt entry');
      },
    };
    storage.setItem('game', JSON.stringify({ options: { start: 0 }, log: [{ add: 1 }], cursor: 1 }));
    const s = new SoloSession(throwing, 'game', storage);
    expect(s.state).toBeNull();
  });

  it('keeps playing when storage writes fail', () => {
    const s = new SoloSession(config, 'game', new ThrowingStorage());
    s.start({ start: 0 });
    s.submit({ add: 7 });
    expect(s.state).toEqual({ total: 7, moves: 1 });
  });

  it('property: state always equals the fold of the live log', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ op: fc.constant('submit' as const), add: fc.integer({ min: -9, max: 9 }) }),
            fc.record({ op: fc.constant('undo' as const) }),
            fc.record({ op: fc.constant('redo' as const) }),
          ),
          { maxLength: 60 },
        ),
        (ops) => {
          const s = new SoloSession(config, 'game', new FakeStorage());
          s.start({ start: 0 });
          for (const op of ops) {
            if (op.op === 'submit') s.submit({ add: op.add });
            else if (op.op === 'undo') s.undo();
            else s.redo();
          }
          const folded = s.log.reduce((state, entry) => config.apply(state, entry), config.init({ start: 0 }));
          expect(s.state).toEqual(folded);
        },
      ),
    );
  });
});
