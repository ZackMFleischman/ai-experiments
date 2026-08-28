// Build-time artifact compiler (T2.2, T8.1): vendored lists → generated/{id}.dawg,
// vendored gloss sources → generated/gloss/. Generated artifacts are never
// committed; the app serves them as assets and the functions bundle embeds the
// DAWGs (T2.3). Run via `pnpm --filter @lex/dict build`.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDawg } from './dawg.js';
import {
  assertGlossEntry,
  formatGlossShard,
  GLOSS_SHARD_COUNT,
  parseGlossText,
  shardGlossary,
  type GlossManifest,
} from './glossary.js';
import { normalizeWordList, WORD_LIST_FILES } from './wordlist.js';

const words = (name: string) => readFileSync(new URL(`../words/${name}`, import.meta.url), 'utf8');
const outDir = fileURLToPath(new URL('../generated', import.meta.url));

mkdirSync(outDir, { recursive: true });
for (const [file, id] of WORD_LIST_FILES) {
  const list = normalizeWordList(words(file));
  const hash = createHash('sha256').update(list.join('\n')).digest('hex');
  const bytes = buildDawg(list, id, hash);
  writeFileSync(`${outDir}/${id}.dawg`, bytes);
  console.log(`${id}: ${list.length} words → ${(bytes.byteLength / 1024).toFixed(0)} KB (${hash.slice(0, 12)}…)`);
}

// Glossary (DESIGN §5.5). One artifact for every dictionary: a definition is a
// property of a word, not of a word list, so sharding it once beats shipping
// three overlapping copies. Curated entries are merged last — they win.
const merged = parseGlossText(words('wordnet-glosses.txt'));
parseGlossText(words('curated-glosses.txt'), merged);
const entries = [...merged.values()].sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
for (const entry of entries) assertGlossEntry(entry);

const glossHash = createHash('sha256')
  .update(entries.map((e) => `${e.word}\t${e.pos}\t${e.gloss}`).join('\n'))
  .digest('hex');
const glossPath = glossHash.slice(0, 12);
// Wipe first: the shard path is content-addressed, so without this a rebuild
// leaves the previous build's directory behind and the app copies both into
// dist (double the bytes shipped, none of them reachable).
rmSync(`${outDir}/gloss`, { recursive: true, force: true });
const glossDir = `${outDir}/gloss/${glossPath}`;
mkdirSync(glossDir, { recursive: true });

let glossBytes = 0;
const shards = shardGlossary(entries);
for (const [index, shard] of shards.entries()) {
  const text = formatGlossShard(shard);
  glossBytes += Buffer.byteLength(text);
  writeFileSync(`${glossDir}/${index}.txt`, text);
}
const manifest: GlossManifest = {
  version: 1,
  path: glossPath,
  shardCount: GLOSS_SHARD_COUNT,
  entryCount: entries.length,
  sourceHash: glossHash,
};
writeFileSync(`${outDir}/gloss/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const biggest = Math.max(...shards.map((shard) => Buffer.byteLength(formatGlossShard(shard))));
console.log(
  `gloss: ${entries.length} definitions → ${GLOSS_SHARD_COUNT} shards, ` +
    `${(glossBytes / 1024).toFixed(0)} KB total / ${(biggest / 1024).toFixed(0)} KB largest (${glossPath}…)`,
);
