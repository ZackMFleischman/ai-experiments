import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from './thresholds';
import { emptyState, reduceFrame } from './reducer';
import type { DetectionFrame, DetectionState } from './types';

const T = DEFAULT_THRESHOLDS;

function frame(streamId: string, bearCount: number, extra: Partial<DetectionFrame> = {}): DetectionFrame {
  return { streamId, ts: 1000, bearCount, ...extra };
}

function apply(state: DetectionState, f: DetectionFrame) {
  return reduceFrame(state, f, T);
}

describe('reduceFrame', () => {
  it('tracks per-stream counts and a running total', () => {
    let s = emptyState();
    s = apply(s, frame('falls', 3)).state;
    s = apply(s, frame('underwater', 2)).state;
    expect(s.byStream['falls']?.bearCount).toBe(3);
    expect(s.total).toBe(5);
    expect(s.peakTotal).toBe(5);
  });

  it('peakTotal never decreases', () => {
    let s = emptyState();
    s = apply(s, frame('falls', 8)).state;
    s = apply(s, frame('falls', 1)).state;
    expect(s.total).toBe(1);
    expect(s.peakTotal).toBe(8);
  });

  it('fires bear-alert once on the crossing above N, not every frame', () => {
    let s = emptyState();
    // default alert threshold is 5 → alert on STRICTLY MORE than 5.
    let r = apply(s, frame('falls', 5));
    expect(r.events.find((e) => e.type === 'bear-alert')).toBeUndefined();
    s = r.state;

    r = apply(s, frame('falls', 6));
    expect(r.events.filter((e) => e.type === 'bear-alert')).toHaveLength(1);
    s = r.state;

    r = apply(s, frame('falls', 7));
    expect(r.events.find((e) => e.type === 'bear-alert')).toBeUndefined();
  });

  it('fires bear-alert-cleared when a feed calms back down', () => {
    let s = emptyState();
    s = apply(s, frame('falls', 9)).state;
    const r = apply(s, frame('falls', 2));
    expect(r.events.find((e) => e.type === 'bear-alert-cleared')).toBeDefined();
  });

  it('declares Bearapalooza at exactly 12 and only on the crossing', () => {
    let s = emptyState();
    let r = apply(s, frame('falls', 11));
    expect(r.events.find((e) => e.type === 'bearapalooza')).toBeUndefined();
    s = r.state;

    r = apply(s, frame('falls', 12));
    const boom = r.events.find((e) => e.type === 'bearapalooza');
    expect(boom).toMatchObject({ type: 'bearapalooza', streamId: 'falls', count: 12 });
    s = r.state;

    r = apply(s, frame('falls', 14));
    expect(r.events.find((e) => e.type === 'bearapalooza')).toBeUndefined();
  });

  it('passes a fish-catch through as an event', () => {
    const r = apply(emptyState(), frame('underwater', 1, { fishCatch: { id: 'c1', confidence: 0.9 } }));
    expect(r.events.find((e) => e.type === 'fish-catch')).toMatchObject({
      type: 'fish-catch',
      streamId: 'underwater',
    });
  });
});
