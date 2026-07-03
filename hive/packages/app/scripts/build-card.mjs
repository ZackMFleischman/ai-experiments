// Apps-page card image (T6.6, DESIGN §7): the hive-cluster hero composed from
// the real sprite glyphs, rendered to a static PNG committed in the
// PersonalWebsite repo. Usage: node build-card.mjs <output.png>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = process.argv[2];
if (!out) throw new Error('usage: node build-card.mjs <output.png>');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sprites = readFileSync(join(root, 'src', 'assets', 'hive-sprites.svg'), 'utf8');

function glyph(id, color) {
  const m = new RegExp(`<symbol id="${id}"[^>]*>([\\s\\S]*?)</symbol>`).exec(sprites);
  if (!m) throw new Error(`${id} not found`);
  return m[1].replaceAll('currentColor', color);
}

const CREAM = '#f3e9d2';
const CHARCOAL = '#3a352e';
const CREAM_INK = '#4a3b20';
const DARK_INK = '#efe7d2';

function tile(x, y, base, ink, bug) {
  return `<g transform="translate(${x},${y})">
    <polygon points="50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26"
      fill="${base}" stroke="#00000040" stroke-width="3" stroke-linejoin="round"/>
    <g transform="translate(14,14) scale(0.72)">${glyph(`bug-${bug}`, ink)}</g>
  </g>`;
}

// A small decorative cluster echoing the landing hero.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#181614"/>
  <g transform="translate(240,60)">
    ${tile(0, 72, CREAM, CREAM_INK, 'ladybug')}
    ${tile(75, 28, CREAM, CREAM_INK, 'ant')}
    ${tile(75, 116, CREAM, CREAM_INK, 'queen')}
    ${tile(150, 72, CHARCOAL, DARK_INK, 'spider')}
    ${tile(225, 28, CHARCOAL, DARK_INK, 'mosquito')}
    ${tile(225, 116, CHARCOAL, DARK_INK, 'beetle')}
  </g>
  <text x="400" y="378" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
    font-size="64" font-weight="700" letter-spacing="22" fill="#f0ece4">HIVE</text>
  <text x="400" y="424" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
    font-size="21" fill="#b9b0a2">Two players. One hive. Don't get surrounded.</text>
</svg>`;

await sharp(Buffer.from(svg)).resize(800, 500).png().toFile(out);
console.log(`card: ${out}`);
