import type { DetectionBox, DetectionFrame, DetectionSource } from '../contract';

// The optional "frontend detector" — real in-browser object detection (COCO-SSD,
// which has a native "bear" class) running on an HTMLVideoElement. It only works on
// a SAME-ORIGIN / CORS-enabled video (a webcam, or an HLS source you control) — NOT
// on a cross-origin YouTube iframe, whose pixels the browser refuses to expose.
//
// It exists to (a) prove the pipeline end-to-end on a source you control, and (b)
// show the migration path the user described: a frontend detector today that a
// backend detector later replaces. TF.js is lazy-loaded so it never touches the base
// bundle. Point it at a webcam aimed at, well, a bear documentary.
export function createFrontendCvSource(video: HTMLVideoElement, streamId: string): DetectionSource {
  const listeners = new Set<(f: DetectionFrame) => void>();
  let raf: number | null = null;
  let stopped = false;
  // Loaded lazily on start(). Typed loosely to avoid importing tfjs types eagerly.
  let model: { detect: (el: HTMLVideoElement) => Promise<Array<{ class: string; score: number; bbox: number[] }>> } | null =
    null;

  async function ensureModel(): Promise<void> {
    if (model) return;
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    model = (await cocoSsd.load()) as unknown as NonNullable<typeof model>;
  }

  async function loop(): Promise<void> {
    if (stopped || !model) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const preds = await model.detect(video);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const boxes: DetectionBox[] = [];
      for (const p of preds) {
        if (p.score < 0.45) continue;
        const label = p.class === 'bear' ? 'bear' : p.class === 'fish' ? 'salmon' : null;
        if (!label) continue;
        const [bx, by, bw, bh] = [p.bbox[0] ?? 0, p.bbox[1] ?? 0, p.bbox[2] ?? 0, p.bbox[3] ?? 0];
        boxes.push({ x: bx / vw, y: by / vh, w: bw / vw, h: bh / vh, label, score: p.score });
      }
      const bearCount = boxes.filter((b) => b.label === 'bear').length;
      const frame: DetectionFrame = { streamId, ts: Date.now(), bearCount, boxes };
      for (const l of listeners) l(frame);
    }
    if (!stopped) raf = requestAnimationFrame(() => void loop());
  }

  return {
    kind: 'frontend-cv',
    start() {
      stopped = false;
      void ensureModel().then(() => {
        if (!stopped) void loop();
      });
    },
    stop() {
      stopped = true;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
