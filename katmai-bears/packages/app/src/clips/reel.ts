// Daily Reel stitcher — concatenates the day's fish-catch clips into ONE downloadable
// mp4/H.264 file, fully client-side, using the single-threaded ffmpeg.wasm core.
//
// Single-threaded on purpose: the multithreaded core needs SharedArrayBuffer, which
// needs cross-origin isolation (COOP/COEP), which would break the YouTube iframe
// embeds. ST needs none of that. The core is self-hosted (see scripts/copy-ffmpeg.mjs)
// and loaded on demand so it never weighs down the base bundle.

import type { ClipView } from './store';

type FFmpegInstance = {
  load: (opts: { coreURL: string; wasmURL: string }) => Promise<boolean>;
  writeFile: (name: string, data: Uint8Array) => Promise<boolean>;
  readFile: (name: string) => Promise<Uint8Array | string>;
  deleteFile: (name: string) => Promise<boolean>;
  exec: (args: string[]) => Promise<number>;
  on: (event: 'progress', cb: (e: { progress: number }) => void) => void;
};

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

async function getFfmpeg(): Promise<FFmpegInstance> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');
      const base = import.meta.env.BASE_URL;
      const ffmpeg = new FFmpeg() as unknown as FFmpegInstance;
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}ffmpeg/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}ffmpeg/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

function extFor(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

/**
 * Stitch clips (any browser-recorded codec) into a single mp4. Inputs are all the
 * same 640×360 video-only canvas recordings, so a straight concat filter + libx264
 * re-encode yields a uniform, universally-playable file.
 */
export async function stitchClipsToMp4(clips: ClipView[], onProgress?: (ratio: number) => void): Promise<Blob> {
  if (clips.length === 0) throw new Error('no clips to stitch');
  const ffmpeg = await getFfmpeg();
  const { fetchFile } = await import('@ffmpeg/util');

  if (onProgress) ffmpeg.on('progress', ({ progress }) => onProgress(Math.max(0, Math.min(1, progress))));

  const names: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (!c) continue;
    const name = `in${i}.${extFor(c.mime)}`;
    await ffmpeg.writeFile(name, await fetchFile(c.blob));
    names.push(name);
  }

  const inputArgs = names.flatMap((n) => ['-i', n]);
  const filter = `${names.map((_, i) => `[${i}:v:0]`).join('')}concat=n=${names.length}:v=1:a=0[outv]`;
  await ffmpeg.exec([
    ...inputArgs,
    '-filter_complex',
    filter,
    '-map',
    '[outv]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    'out.mp4',
  ]);

  const data = await ffmpeg.readFile('out.mp4');
  const raw = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  // Re-wrap into an ArrayBuffer-backed view so it's a valid BlobPart (ffmpeg's
  // typed-array may be declared over ArrayBufferLike, which Blob rejects).
  const bytes = new Uint8Array(raw);

  for (const n of names) await ffmpeg.deleteFile(n).catch(() => undefined);
  await ffmpeg.deleteFile('out.mp4').catch(() => undefined);

  return new Blob([bytes], { type: 'video/mp4' });
}

/** Clips recorded today (local time). The reel is a per-day compilation. */
export function clipsForToday(clips: ClipView[]): ClipView[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return clips.filter((c) => c.ts >= startMs).sort((a, b) => a.ts - b.ts);
}
