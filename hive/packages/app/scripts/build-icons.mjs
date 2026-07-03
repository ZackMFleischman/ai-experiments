// PWA icons exported from the queen glyph in the sprite sheet (DESIGN §6.4:
// raster only where the platform demands it, never hand-maintained). Runs as
// prebuild; outputs are generated, not committed.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sprites = readFileSync(join(root, 'src', 'assets', 'hive-sprites.svg'), 'utf8');

const queenMatch = /<symbol id="bug-queen"[^>]*>([\s\S]*?)<\/symbol>/.exec(sprites);
if (!queenMatch) throw new Error('bug-queen symbol not found in sprite sheet');
const queen = queenMatch[1].replaceAll('currentColor', '#4a3b20');

const tile = `<polygon points="50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26"
  fill="#f3e9d2" stroke="#00000026" stroke-width="3" stroke-linejoin="round"/>`;

function iconSvg({ maskable }) {
  // Maskable icons keep content inside the 80% safe zone on a full-bleed field.
  const content = maskable
    ? `<rect width="100" height="100" fill="#e8a013"/>
       <g transform="translate(16,16) scale(0.68)">${tile}<g transform="translate(10,10) scale(0.8)">${queen}</g></g>`
    : `${tile}<g transform="translate(10,10) scale(0.8)">${queen}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${content}</svg>`;
}

const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

const jobs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
];
for (const { file, size, maskable } of jobs) {
  await sharp(Buffer.from(iconSvg({ maskable }))).resize(size, size).png().toFile(join(out, file));
  console.log(`icons: ${file}`);
}
