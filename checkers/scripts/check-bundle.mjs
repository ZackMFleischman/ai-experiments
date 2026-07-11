// ported from hive/scripts/check-bundle.mjs (adapted — checkers has no
// dictionaries; the gate is firebase-freedom alone)
// The hot-seat bundle must not contain firebase: imports are only ever
// allowed under app/src/sync/ + @parlor/web|server, and the default build
// drops that whole branch at build time. This is the machine check.
import { readdirSync, readFileSync, statSync } from 'node:fs';
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

console.log('bundle check: no firebase in dist');
