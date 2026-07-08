import { CONFIG } from '../config';
import type { DetectionBox, DetectionFrame, DetectionSource, FishCatch } from '../contract';
import { STREAMS } from '../streams';
import { uid } from '../util/id';

// The v1 detector: a plausible fake. Each stream's bear count does a bounded random
// walk; catches and the occasional Bearapalooza surge fire at low probability. This
// makes the counter, alerts, clips, and reel fully live and demoable today. It
// implements the exact same DetectionSource interface a backend WebSocket feed will,
// so swapping it out later touches nothing downstream. Clearly labeled "SIMULATED"
// in the UI so no one mistakes it for real vision.

const MAX_BEARS = 16;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function makeBoxes(bearCount: number, hasCatch: boolean): DetectionBox[] {
  const boxes: DetectionBox[] = [];
  for (let i = 0; i < bearCount; i++) {
    boxes.push({
      x: Math.random() * 0.85,
      y: 0.25 + Math.random() * 0.6,
      w: 0.08 + Math.random() * 0.1,
      h: 0.1 + Math.random() * 0.14,
      label: 'bear',
      score: 0.6 + Math.random() * 0.39,
    });
  }
  if (hasCatch) {
    boxes.push({
      x: Math.random() * 0.8,
      y: 0.4 + Math.random() * 0.4,
      w: 0.06,
      h: 0.03,
      label: 'salmon',
      score: 0.7 + Math.random() * 0.29,
    });
  }
  return boxes;
}

export function createSimulatorSource(): DetectionSource {
  const counts = new Map<string, number>(STREAMS.map((s) => [s.id, Math.floor(Math.random() * 3)]));
  const listeners = new Set<(f: DetectionFrame) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(): void {
    const now = Date.now();
    for (const s of STREAMS) {
      let c = counts.get(s.id) ?? 0;
      c += Math.round((Math.random() - 0.5) * 3);
      // Rare surge — enough to occasionally cross into Bearapalooza territory.
      if (Math.random() < 0.02) c += 4 + Math.floor(Math.random() * 8);
      c = clamp(c, 0, MAX_BEARS);
      counts.set(s.id, c);

      const hasCatch = c > 0 && Math.random() < 0.05;
      const fishCatch: FishCatch | undefined = hasCatch
        ? { id: uid(), confidence: 0.6 + Math.random() * 0.4 }
        : undefined;

      const frame: DetectionFrame = {
        streamId: s.id,
        ts: now,
        bearCount: c,
        boxes: makeBoxes(c, hasCatch),
        ...(fishCatch ? { fishCatch } : {}),
      };
      for (const l of listeners) l(frame);
    }
  }

  return {
    kind: 'simulator',
    start() {
      if (timer === null) timer = setInterval(tick, CONFIG.simulatorTickMs);
      tick();
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
