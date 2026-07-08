// ported from hive/scripts/check-bundle.mjs (adapted)
// T3.12: the hot-seat bundle must not contain firebase (imports are only ever
// allowed under app/src/sync/ + @parlor/web|server, none of which M3 has) —
// and must ship the dictionaries the offline PWA needs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'app', 'dist');

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|css|html|webmanifest|json)$/.test(entry)) yield path;
  }
}

const hits = [];
for (const file of files(dist)) {
  if (/firebase/i.test(readFileSync(file, 'utf8'))) hits.push(file);
}
if (hits.length > 0) {
  console.error(`firebase found in the static bundle:\n${hits.join('\n')}`);
  process.exit(1);
}

for (const dict of ['enable1.dawg', '2of12inf.dawg', 'nwl2023.dawg']) {
  if (!existsSync(join(dist, 'dict', dict))) {
    console.error(`missing dictionary in dist: dict/${dict} — run \`pnpm --filter @lex/dict build\` before the app build`);
    process.exit(1);
  }
}

console.log('bundle check: no firebase in dist; dictionaries present');
