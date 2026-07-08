// Generates the PWA icon set from a single inline SVG source using sharp.
// Runs as `prebuild`. Idempotent — re-renders every time, cheap enough.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');

// A bear silhouette over a river-green field. Simple, recognizable at 192px.
const svg = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${bg}"/>
  <g fill="#f4e9d8">
    <!-- ears -->
    <circle cx="176" cy="150" r="46"/>
    <circle cx="336" cy="150" r="46"/>
    <circle cx="176" cy="150" r="22" fill="#8a5a2b"/>
    <circle cx="336" cy="150" r="22" fill="#8a5a2b"/>
    <!-- head -->
    <ellipse cx="256" cy="268" rx="148" ry="132"/>
    <!-- muzzle -->
    <ellipse cx="256" cy="322" rx="72" ry="58" fill="#e7d3b3"/>
    <!-- eyes -->
    <circle cx="206" cy="248" r="16" fill="#2b1a0e"/>
    <circle cx="306" cy="248" r="16" fill="#2b1a0e"/>
    <!-- nose -->
    <ellipse cx="256" cy="300" rx="26" ry="18" fill="#2b1a0e"/>
  </g>
  <!-- salmon -->
  <g transform="rotate(-18 360 392)">
    <ellipse cx="360" cy="392" rx="60" ry="20" fill="#e8734f"/>
    <path d="M300 392 l-26 -18 l0 36 z" fill="#e8734f"/>
    <circle cx="392" cy="388" r="4" fill="#0b1410"/>
  </g>
</svg>`;

async function main() {
  await mkdir(outDir, { recursive: true });
  const primary = Buffer.from(svg('#0b3d2e'));
  const maskable = Buffer.from(svg('#0b3d2e'));

  await Promise.all([
    sharp(primary).resize(192, 192).png().toFile(join(outDir, 'icon-192.png')),
    sharp(primary).resize(512, 512).png().toFile(join(outDir, 'icon-512.png')),
    // Maskable needs safe-zone padding; sharp extend adds a border so the bear
    // survives the platform's circular/rounded mask crop.
    sharp(maskable)
      .resize(410, 410)
      .extend({ top: 51, bottom: 51, left: 51, right: 51, background: '#0b3d2e' })
      .png()
      .toFile(join(outDir, 'maskable-512.png')),
    sharp(primary).resize(180, 180).png().toFile(join(outDir, 'apple-touch-icon.png')),
    sharp(primary).resize(32, 32).png().toFile(join(outDir, 'favicon-32.png')),
  ]);

  // A raw SVG favicon too (crisp on desktop tabs).
  await writeFile(join(outDir, 'favicon.svg'), svg('#0b3d2e'));
  console.log('[build-icons] wrote icon set to', outDir);
}

main().catch((err) => {
  console.error('[build-icons] failed:', err);
  process.exit(1);
});
