import type { DetectionFrame, DetectionSource } from '../contract';

// The migration target. When a backend detector exists (server-side stream ingest +
// real object detection), it emits DetectionFrame JSON over a WebSocket. Swapping
// the simulator for this source is the entire client-side migration — every
// downstream consumer keeps working unchanged, because the frame schema is identical.
//
// Deliberately tolerant: reconnects with backoff, ignores malformed messages. The
// server side does not exist yet; this is the ready-to-wire client half.
export function createWebSocketSource(url: string): DetectionSource {
  const listeners = new Set<(f: DetectionFrame) => void>();
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = 1000;

  function connect(): void {
    if (stopped || !url) return;
    ws = new WebSocket(url);
    ws.onopen = () => {
      backoff = 1000;
    };
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(String(ev.data)) as DetectionFrame;
        if (typeof frame.streamId === 'string' && typeof frame.bearCount === 'number') {
          for (const l of listeners) l(frame);
        }
      } catch {
        // ignore malformed frame
      }
    };
    ws.onclose = () => {
      if (stopped) return;
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 15000);
    };
    ws.onerror = () => ws?.close();
  }

  return {
    kind: 'websocket',
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      ws?.close();
      ws = null;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
