// Copies the single-threaded ffmpeg.wasm core into public/ffmpeg so it's served
// same-origin (no CDN, no COOP/COEP, no widening connect-src to a third party).
// Runs in predev/prebuild. Soft-fails if the dep isn't installed — the Daily Reel
// stitch just degrades to sequential playback in that case.
import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'ffmpeg');

// Derive the package dir from a resolved entry rather than `.../package.json` — the
// package's `exports` map blocks the package.json subpath under pnpm.
function resolveCoreDir() {
  const entry = require.resolve('@ffmpeg/core');
  const marker = `${sep}@ffmpeg${sep}core${sep}`;
  const idx = entry.lastIndexOf(marker);
  if (idx === -1) throw new Error(`unexpected @ffmpeg/core path: ${entry}`);
  return entry.slice(0, idx + marker.length - 1);
}

async function main() {
  let coreDir;
  try {
    coreDir = resolveCoreDir();
  } catch {
    console.warn('[copy-ffmpeg] @ffmpeg/core not installed; skipping (reel stitch will degrade)');
    return;
  }
  const esm = join(coreDir, 'dist', 'esm');
  await mkdir(outDir, { recursive: true });
  for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
    await cp(join(esm, f), join(outDir, f));
  }
  console.log('[copy-ffmpeg] copied ffmpeg core to', outDir);
}

main().catch((e) => {
  console.warn('[copy-ffmpeg] failed:', e.message);
});
