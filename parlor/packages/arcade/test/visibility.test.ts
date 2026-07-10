import { describe, expect, it } from 'vitest';
import { pauseWhenHidden, type VisibilityDoc } from '../src/index.js';

function fakeDoc() {
  const listeners = new Set<() => void>();
  const doc = {
    hidden: false,
    addEventListener(_type: string, listener: () => void): void {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void): void {
      listeners.delete(listener);
    },
  };
  return {
    doc: doc as VisibilityDoc & { hidden: boolean },
    setHidden(hidden: boolean): void {
      doc.hidden = hidden;
      for (const listener of listeners) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe('pauseWhenHidden', () => {
  it('pauses on hidden, never resumes on visible', () => {
    const { doc, setHidden } = fakeDoc();
    const calls: string[] = [];
    pauseWhenHidden({ pause: () => calls.push('pause') }, doc);
    setHidden(true);
    expect(calls).toEqual(['pause']);
    setHidden(false); // coming back is the player's act — nothing happens
    expect(calls).toEqual(['pause']);
  });

  it('unsubscribes', () => {
    const bench = fakeDoc();
    const calls: string[] = [];
    const dispose = pauseWhenHidden({ pause: () => calls.push('pause') }, bench.doc);
    dispose();
    expect(bench.listenerCount).toBe(0);
    bench.setHidden(true);
    expect(calls).toEqual([]);
  });
});
