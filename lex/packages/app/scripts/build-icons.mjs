// ported from hive/packages/app/scripts/build-icons.mjs (adapted)
// PWA icons exported from the tile wordmark (DESIGN §7.5): a classic-skin
// tile bearing the L. Runs as prebuild; outputs are generated, not committed.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Classic tile skin values (src/board/skin.ts light variant).
const TILE_BG = '#f7ecd0';
const TILE_FG = '#2f2a20';
const TILE_EDGE = '#c9b98c';
const FIELD = '#0d7a5f'; // lex board green (theme primary)

const tile = `
  <rect x="6" y="6" width="88" height="88" rx="16"
    fill="${TILE_BG}" stroke="${TILE_EDGE}" stroke-width="3"/>
  <text x="46" y="68" font-family="Georgia, 'Times New Roman', serif" font-size="56"
    font-weight="700" fill="${TILE_FG}" text-anchor="middle">L</text>
  <text x="82" y="86" font-family="Georgia, 'Times New Roman', serif" font-size="20"
    font-weight="600" fill="${TILE_FG}" text-anchor="middle">1</text>`;

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
for (const { file, size, maskable } of jobs) {
  await sharp(Buffer.from(iconSvg({ maskable }))).resize(size, size).png().toFile(join(out, file));
  console.log(`icons: ${file}`);
}

// iOS home-screen icon: FULL-BLEED tile art, no transparency — iOS paints
// transparent margins black (the letterbox Zack saw) and applies its own
// corner mask, so the tile face fills the whole canvas edge to edge.
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${TILE_BG}"/>
  <rect x="0" y="93" width="100" height="7" fill="${TILE_EDGE}"/>
  <text x="46" y="72" font-family="Georgia, 'Times New Roman', serif" font-size="62"
    font-weight="700" fill="${TILE_FG}" text-anchor="middle">L</text>
  <text x="86" y="90" font-family="Georgia, 'Times New Roman', serif" font-size="20"
    font-weight="600" fill="${TILE_FG}" text-anchor="middle">1</text>
</svg>`;
await sharp(Buffer.from(appleSvg)).resize(180, 180).png().toFile(join(out, 'apple-touch-icon.png'));
console.log('icons: apple-touch-icon.png');

// Website card thumbnail (T6.6): the L-E-X tile wordmark on the board green,
// 16:9, for zackmfleischman.com's apps grid (goes into PersonalWebsite's
// assets/images/lex-card.png). Emitted to artifacts/ — generated, not committed.
const cardTile = (x, letter, points) => `
  <g transform="translate(${x},0)">
    <rect x="0" y="0" width="100" height="100" rx="16"
      fill="${TILE_BG}" stroke="${TILE_EDGE}" stroke-width="3"/>
    <text x="44" y="70" font-family="Georgia, 'Times New Roman', serif" font-size="60"
      font-weight="700" fill="${TILE_FG}" text-anchor="middle">${letter}</text>
    <text x="84" y="90" font-family="Georgia, 'Times New Roman', serif" font-size="22"
      font-weight="600" fill="${TILE_FG}" text-anchor="middle">${points}</text>
  </g>`;
const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270">
  <rect width="480" height="270" fill="${FIELD}"/>
  <g transform="translate(75,80)">
    ${cardTile(0, 'L', 1)}${cardTile(115, 'E', 1)}${cardTile(230, 'X', 8)}
  </g>
  <text x="240" y="235" font-family="Helvetica, Arial, sans-serif" font-size="20"
    fill="#e6f2ee" text-anchor="middle" letter-spacing="1">A crossword tile game for two</text>
</svg>`;
const artifacts = join(root, '..', '..', 'artifacts');
mkdirSync(artifacts, { recursive: true });
await sharp(Buffer.from(cardSvg)).resize(1200, 675).png().toFile(join(artifacts, 'lex-card.png'));
console.log('icons: ../artifacts/lex-card.png (website card — copy into PersonalWebsite)');

// Notification badge (T5.1/T5.3): monochrome white tile-L on transparent —
// status-bar badges are alpha masks, color would render as a blob.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke="#fff" stroke-width="9"/>
  <text x="50" y="72" font-family="Georgia, 'Times New Roman', serif" font-size="52"
    font-weight="700" fill="#fff" text-anchor="middle">L</text>
</svg>`;
await sharp(Buffer.from(badgeSvg)).resize(72, 72).png().toFile(join(out, 'badge-72.png'));
console.log('icons: badge-72.png');
