import { CONFIG } from '../config';
import type { DetectionBox } from '../contract';

export interface RecordedClip {
  blob: Blob;
  mime: string;
  thumbnail: string;
  durationMs: number;
}

// Preference order: VP9 → VP8 → generic webm → mp4/H.264. Safari records mp4 only and
// cannot produce webm, so we never assume a container — we negotiate at runtime.
const MIME_PREFERENCE = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of MIME_PREFERENCE) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement('canvas').captureStream === 'function' &&
    pickMime() !== null
  );
}

interface RecordOpts {
  streamTitle: string;
  bearCount: number;
  boxes: DetectionBox[];
}

/**
 * Record a short synthetic clip of a fish-catch moment. Because a cross-origin
 * YouTube frame's pixels are unreadable, we can't capture the real feed — so we draw
 * a labeled recap card (title, animated bear/salmon boxes, "FISH CATCH!" splash) onto
 * a hidden canvas and record THAT via captureStream → MediaRecorder. Real, downloadable
 * video; synthetic imagery until a backend can supply true frames.
 */
export function recordCatchClip(opts: RecordOpts): Promise<RecordedClip> {
  const mime = pickMime();
  if (mime === null) return Promise.reject(new Error('MediaRecorder unsupported'));

  const W = 640;
  const H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('2d context unavailable'));

  const stream = canvas.captureStream(CONFIG.clipFps);
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  let thumbnail = '';

  const start = Date.now();
  let raf = 0;

  const drift = opts.boxes.map(() => ({ dx: (Math.random() - 0.5) * 0.02, dy: (Math.random() - 0.5) * 0.01 }));

  function draw(): void {
    const t = (Date.now() - start) / 1000;
    // Water-y background.
    const g = ctx!.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b3d2e');
    g.addColorStop(1, '#08201a');
    ctx!.fillStyle = g;
    ctx!.fillRect(0, 0, W, H);

    // Boxes drift a little to imply motion.
    opts.boxes.forEach((b, i) => {
      const d = drift[i] ?? { dx: 0, dy: 0 };
      const x = (b.x + d.dx * t) * W;
      const y = (b.y + d.dy * t) * H;
      const w = b.w * W;
      const h = b.h * H;
      ctx!.lineWidth = 2;
      ctx!.strokeStyle = b.label === 'salmon' ? '#e8734f' : '#8fd6b4';
      ctx!.strokeRect(x, y, w, h);
      ctx!.fillStyle = b.label === 'salmon' ? '#e8734f' : '#8fd6b4';
      ctx!.font = '12px sans-serif';
      ctx!.fillText(b.label, x, y - 4);
    });

    // Title + splash.
    ctx!.fillStyle = 'rgba(0,0,0,0.35)';
    ctx!.fillRect(0, 0, W, 40);
    ctx!.fillStyle = '#f4e9d8';
    ctx!.font = 'bold 18px sans-serif';
    ctx!.fillText(opts.streamTitle, 12, 26);

    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx!.fillStyle = `rgba(232,115,79,${0.6 + 0.4 * pulse})`;
    ctx!.font = 'bold 36px sans-serif';
    ctx!.textAlign = 'center';
    ctx!.fillText('🐻🎣 FISH CATCH!', W / 2, H / 2);
    ctx!.textAlign = 'left';
    ctx!.fillStyle = '#cfe8dc';
    ctx!.font = '13px sans-serif';
    ctx!.fillText(`${opts.bearCount} bear${opts.bearCount === 1 ? '' : 's'} on screen`, 12, H - 14);

    if (!thumbnail && t > 0.4) thumbnail = canvas.toDataURL('image/jpeg', 0.6);
  }

  return new Promise<RecordedClip>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error('recording failed'));
    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      const blob = new Blob(chunks, { type: mime });
      resolve({ blob, mime, thumbnail: thumbnail || canvas.toDataURL('image/jpeg', 0.6), durationMs: Date.now() - start });
    };

    const tick = (): void => {
      draw();
      if (Date.now() - start < CONFIG.clipDurationMs) {
        raf = requestAnimationFrame(tick);
      } else {
        recorder.stop();
      }
    };
    recorder.start();
    tick();
  });
}
