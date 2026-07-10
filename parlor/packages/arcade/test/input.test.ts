import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  InputQueue,
  TraceRecorder,
  TraceReplayer,
  traceEnd,
  trackHeldKeys,
  trackPointer,
  type KeyEventLike,
  type PointerEventLike,
} from '../src/index.js';

describe('InputQueue', () => {
  it('drains in arrival order and clears', () => {
    const queue = new InputQueue<string>();
    queue.push('a');
    queue.push('b');
    expect(queue.size).toBe(2);
    expect(queue.drain()).toEqual(['a', 'b']);
    expect(queue.drain()).toEqual([]);
    expect(queue.size).toBe(0);
  });
});

describe('trace record/replay', () => {
  it('omits empty ticks and copies the drained array', () => {
    const recorder = new TraceRecorder<string>();
    const drained = ['x'];
    recorder.record(0, []);
    recorder.record(3, drained);
    drained.push('mutated-after-record');
    expect(recorder.trace()).toEqual([{ tick: 3, actions: ['x'] }]);
  });

  it('traceEnd covers the last recorded tick', () => {
    expect(traceEnd([])).toBe(0);
    expect(traceEnd([{ tick: 7, actions: ['x'] }])).toBe(8);
  });

  it('replays actions at their recorded ticks', () => {
    const trace = [
      { tick: 1, actions: ['a'] },
      { tick: 4, actions: ['b', 'c'] },
    ];
    const replayer = new TraceReplayer(trace);
    const seen: string[][] = [];
    for (let tick = 0; tick < traceEnd(trace); tick++) {
      seen.push(replayer.next(tick));
    }
    expect(seen).toEqual([[], ['a'], [], [], ['b', 'c']]);
    expect(replayer.done).toBe(true);
  });

  it('property: record → replay reproduces every tick exactly', () => {
    fc.assert(
      fc.property(
        // Sparse schedule: per-tick action lists over a short run.
        fc.array(fc.array(fc.string(), { maxLength: 3 }), { maxLength: 40 }),
        (schedule) => {
          const recorder = new TraceRecorder<string>();
          schedule.forEach((actions, tick) => recorder.record(tick, actions));
          const replayer = new TraceReplayer(recorder.trace());
          schedule.forEach((actions, tick) => {
            expect(replayer.next(tick)).toEqual(actions);
          });
          expect(replayer.done).toBe(true);
        },
      ),
    );
  });
});

type Listener = (event: KeyEventLike & PointerEventLike) => void;

function fakeTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener): void {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener): void {
      listeners.get(type)?.delete(listener);
    },
    getBoundingClientRect() {
      return { left: 100, top: 50, width: 200, height: 100 };
    },
    fire(type: string, event: KeyEventLike & PointerEventLike = {}): void {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    count(): number {
      let total = 0;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
  };
}

describe('trackHeldKeys', () => {
  it('tracks only the given keys, prevents their default', () => {
    const target = fakeTarget();
    const held = trackHeldKeys(target, ['ArrowLeft', 'ArrowRight']);
    let prevented = 0;
    target.fire('keydown', { key: 'ArrowLeft', preventDefault: () => prevented++ });
    target.fire('keydown', { key: 'q', preventDefault: () => prevented++ });
    expect(held.isDown('ArrowLeft')).toBe(true);
    expect(held.isDown('q')).toBe(false);
    expect(prevented).toBe(1);
    target.fire('keyup', { key: 'ArrowLeft' });
    expect(held.isDown('ArrowLeft')).toBe(false);
  });

  it('blur releases everything; dispose unhooks', () => {
    const target = fakeTarget();
    const held = trackHeldKeys(target, ['ArrowLeft']);
    target.fire('keydown', { key: 'ArrowLeft' });
    target.fire('blur');
    expect(held.isDown('ArrowLeft')).toBe(false);
    held.dispose();
    expect(target.count()).toBe(0);
    target.fire('keydown', { key: 'ArrowLeft' });
    expect(held.isDown('ArrowLeft')).toBe(false);
  });
});

describe('trackPointer', () => {
  it('normalizes into [0,1] of the surface and clamps outside drags', () => {
    const target = fakeTarget();
    const points: Array<[number, number]> = [];
    const dispose = trackPointer(target, (x, y) => points.push([x, y]));
    target.fire('pointerdown', { clientX: 200, clientY: 100 });
    target.fire('pointermove', { clientX: 0, clientY: 500 });
    expect(points).toEqual([
      [0.5, 0.5],
      [0, 1],
    ]);
    dispose();
    expect(target.count()).toBe(0);
  });
});
