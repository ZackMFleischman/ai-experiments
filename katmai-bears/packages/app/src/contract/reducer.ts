import type { DetectionEvent, DetectionFrame, DetectionState, StreamStatus } from './types';
import type { Thresholds } from './thresholds';

export function emptyState(): DetectionState {
  return { byStream: {}, total: 0, peakTotal: 0 };
}

/**
 * Fold one frame into the detection state, returning the next state plus any
 * domain events that crossing thresholds produced. Pure: no I/O, no clock, no
 * randomness — trivially unit-testable and identical on client or server.
 */
export function reduceFrame(
  state: DetectionState,
  frame: DetectionFrame,
  thresholds: Thresholds,
): { state: DetectionState; events: DetectionEvent[] } {
  const prev = state.byStream[frame.streamId];
  const wasAlerting = prev?.alerting ?? false;
  const wasBearapalooza = prev?.bearapalooza ?? false;

  const isAlerting = frame.bearCount > thresholds.alert;
  const isBearapalooza = frame.bearCount >= thresholds.bearapalooza;

  const events: DetectionEvent[] = [];
  if (frame.fishCatch) {
    events.push({ type: 'fish-catch', streamId: frame.streamId, ts: frame.ts, catch: frame.fishCatch });
  }
  if (isBearapalooza && !wasBearapalooza) {
    events.push({ type: 'bearapalooza', streamId: frame.streamId, ts: frame.ts, count: frame.bearCount });
  }
  if (isAlerting && !wasAlerting) {
    events.push({
      type: 'bear-alert',
      streamId: frame.streamId,
      ts: frame.ts,
      count: frame.bearCount,
      threshold: thresholds.alert,
    });
  } else if (!isAlerting && wasAlerting) {
    events.push({ type: 'bear-alert-cleared', streamId: frame.streamId, ts: frame.ts, count: frame.bearCount });
  }

  const status: StreamStatus = {
    streamId: frame.streamId,
    bearCount: frame.bearCount,
    boxes: frame.boxes ?? [],
    alerting: isAlerting,
    bearapalooza: isBearapalooza,
    lastUpdate: frame.ts,
  };

  const byStream: Record<string, StreamStatus> = { ...state.byStream, [frame.streamId]: status };
  let total = 0;
  for (const s of Object.values(byStream)) total += s.bearCount;

  return {
    state: { byStream, total, peakTotal: Math.max(state.peakTotal, total) },
    events,
  };
}
