import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectionFrame } from '../contract';
import { STREAMS } from '../streams';
import { createSimulatorSource } from './simulatorSource';

describe('simulatorSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits one well-formed frame per stream on start', () => {
    const src = createSimulatorSource();
    const frames: DetectionFrame[] = [];
    const unsub = src.subscribe((f) => frames.push(f));
    src.start();

    const ids = new Set(STREAMS.map((s) => s.id));
    expect(frames).toHaveLength(STREAMS.length);
    for (const f of frames) {
      expect(ids.has(f.streamId)).toBe(true);
      expect(Number.isInteger(f.bearCount)).toBe(true);
      expect(f.bearCount).toBeGreaterThanOrEqual(0);
      expect(f.bearCount).toBeLessThanOrEqual(16);
      const bears = (f.boxes ?? []).filter((b) => b.label === 'bear').length;
      expect(bears).toBe(f.bearCount);
    }
    src.stop();
    unsub();
  });

  it('keeps ticking on the interval until stopped', () => {
    const src = createSimulatorSource();
    let n = 0;
    src.subscribe(() => {
      n += 1;
    });
    src.start();
    const afterStart = n;
    vi.advanceTimersByTime(1500 * 3);
    expect(n).toBeGreaterThan(afterStart);
    src.stop();
    const afterStop = n;
    vi.advanceTimersByTime(1500 * 3);
    expect(n).toBe(afterStop);
  });
});
