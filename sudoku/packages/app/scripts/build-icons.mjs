// modeled on lex/packages/app/scripts/build-icons.mjs
// PWA icons over the family template (@parlor/brand/icon-template): the paper
// tile bearing sudoku's mark. Runs as prebuild; outputs are generated, not
// committed. Native icons/splash build from the same template + mark in
// build-native-assets.mjs.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { iconSvg, maskableIconSvg } from '@parlor/brand/icon-template';
import { FIELD, MARK } from './mark.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

const jobs = [
  { file: 'icon-192.png', size: 192, svg: iconSvg(MARK) },
  { file: 'icon-512.png', size: 512, svg: iconSvg(MARK) },
  { file: 'maskable-512.png', size: 512, svg: maskableIconSvg(MARK, FIELD) },
];
await Promise.all(
  jobs.map(({ file, size, svg }) =>
    sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(out, file)),
  ),
);
console.log(`icons: wrote ${jobs.length} to public/icons`);
