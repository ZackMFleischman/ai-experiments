// modeled on lex/packages/app/scripts/build-icons.mjs
// PWA icons: a paper tile bearing a mini 3x3 grid with one placed digit.
// Runs as prebuild; outputs are generated, not committed.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAPER = '#f5f3ee';
const INK = '#2b2b33';
const EDGE = '#c9c4b4';
const FIELD = '#3b5bdb'; // sudoku indigo (theme primary)

const tile = `
  <rect x="6" y="6" width="88" height="88" rx="16"
    fill="${PAPER}" stroke="${EDGE}" stroke-width="3"/>
  <g stroke="${INK}" stroke-width="2.5" stroke-linecap="round">
    <line x1="38" y1="18" x2="38" y2="82"/>
    <line x1="62" y1="18" x2="62" y2="82"/>
    <line x1="18" y1="38" x2="82" y2="38"/>
    <line x1="18" y1="62" x2="82" y2="62"/>
  </g>
  <text x="50" y="33" font-family="Georgia, 'Times New Roman', serif" font-size="22"
    font-weight="700" fill="${FIELD}" text-anchor="middle">5</text>`;

function iconSvg({ maskable }) {
  // Maskable icons keep content inside the 80% safe zone on a full-bleed field.
  const content = maskable
    ? `<rect width="100" height="100" fill="${FIELD}"/>
       <g transform="translate(14,14) scale(0.72)">${tile}</g>`
    : tile;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${content}</svg>`;
}

const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

const jobs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
];
await Promise.all(
  jobs.map(({ file, size, maskable }) =>
    sharp(Buffer.from(iconSvg({ maskable }))).resize(size, size).png().toFile(join(out, file)),
  ),
);
console.log(`icons: wrote ${jobs.length} to public/icons`);
