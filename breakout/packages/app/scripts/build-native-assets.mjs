// Native icon/splash sources for @capacitor/assets, from the same family
// template + mark as the PWA icons (BRAND-IMPLEMENTATION.md 4a: "icons/splash
// from @parlor/brand templates"). Writes the tool's expected inputs to
// assets/, then `pnpm native:assets` (breakout root) renders them into the
// committed native shells. Splash uses quiet paper light / near-black dark —
// the "real launch screen" of the Apple 4.2 defense checklist.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { iconSvg, maskableIconSvg, solidIconSvg, splashSvg } from '@parlor/brand/icon-template';
import { FIELD, MARK } from './mark.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets');
mkdirSync(out, { recursive: true });

const DARK = '#121212'; // MUI dark background.default — matches the app's dark paper

const jobs = [
  // iOS flattens alpha anyway; hand it the solid-field icon deliberately.
  { file: 'icon-only.png', size: 1024, svg: solidIconSvg(MARK, FIELD) },
  // Android adaptive: the tile floats on the accent field the OS masks.
  { file: 'icon-foreground.png', size: 1024, svg: iconSvg(MARK) },
  { file: 'icon-background.png', size: 1024, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${FIELD}"/></svg>` },
  { file: 'splash.png', size: 2732, svg: splashSvg(MARK, '#f5f3ee') },
  { file: 'splash-dark.png', size: 2732, svg: splashSvg(MARK, DARK) },
];
await Promise.all(
  jobs.map(({ file, size, svg }) =>
    sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 100) })
      .resize(size, size)
      .png()
      .toFile(join(out, file)),
  ),
);
console.log(`native assets: wrote ${jobs.length} sources to packages/app/assets`);
