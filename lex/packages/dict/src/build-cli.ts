// Build-time DAWG compiler (T2.2): vendored lists → generated/{id}.dawg.
// Generated artifacts are never committed; the app serves them as assets and
// the functions bundle embeds them (T2.3). Run via `pnpm --filter @lex/dict build`.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDawg } from './dawg.js';
import { normalizeWordList } from './wordlist.js';

const words = (name: string) => readFileSync(new URL(`../words/${name}`, import.meta.url), 'utf8');
const outDir = fileURLToPath(new URL('../generated', import.meta.url));

mkdirSync(outDir, { recursive: true });
for (const [file, id] of [
  ['enable1.txt', 'enable1'],
  ['2of12inf.txt', '2of12inf'],
] as const) {
  const list = normalizeWordList(words(file));
  const hash = createHash('sha256').update(list.join('\n')).digest('hex');
  const bytes = buildDawg(list, id, hash);
  writeFileSync(`${outDir}/${id}.dawg`, bytes);
  console.log(`${id}: ${list.length} words → ${(bytes.byteLength / 1024).toFixed(0)} KB (${hash.slice(0, 12)}…)`);
}
