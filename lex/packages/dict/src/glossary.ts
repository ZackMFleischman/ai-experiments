// Glossary format (DESIGN §5.5): the pure half of word definitions — parsing,
// sharding, and the source merge, shared by the build script, the app loader,
// and the tests. Zero-dep and deterministic, like everything else in @lex/dict.
//
// Definitions are cosmetic: they never gate a play, so unlike the DAWG there is
// no client/server identity to protect and no hash to verify at load. What the
// hash in the manifest buys is cache correctness — shards live under a
// content-addressed path, so a re-vendored gloss source can't be served stale.
//
// Shard files are line-oriented text — `WORD<TAB>pos<TAB>gloss`, LF, sorted —
// the same shape as the vendored sources they come from. No escaping rules to
// get wrong: the build rejects a gloss containing a tab or newline.

/** Fixed shard count: ~58k entries over 64 shards ≈ 60 KB each, ~20 KB gzipped. */
export const GLOSS_SHARD_COUNT = 64;

/** Where the app serves glossary artifacts from (mirrors loader.ts BASE_PATH). */
export const GLOSS_BASE_PATH = '/dict/gloss/';

export interface GlossEntry {
  /** The word the player asked about, uppercase A–Z. */
  word: string;
  /** Short part-of-speech tag: 'n', 'v', 'adj', 'adv', 'interj', 'pron', … */
  pos: string;
  gloss: string;
  /**
   * Set when the gloss was found under a reduced form rather than the word
   * itself — CATS resolving through CAT. The UI must say so: the reduction is
   * a spelling heuristic (morphology.ts), not a dictionary fact.
   */
  base?: string;
}

export interface GlossManifest {
  version: 1;
  /** Content-addressed directory holding the shards (first 12 hex of the hash). */
  path: string;
  shardCount: number;
  entryCount: number;
  /** sha256 of the merged source, '\n'-joined — pins what these shards contain. */
  sourceHash: string;
}

/** FNV-1a over the ASCII word — stable across builds, languages, and runtimes. */
export function glossShardOf(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i += 1) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % GLOSS_SHARD_COUNT;
}

/**
 * Parse a `word<TAB>pos<TAB>gloss` source or shard. Words are uppercased (the
 * vendored sources are lowercase; the engine speaks uppercase); later entries
 * win, which is how `curated-glosses.txt` overrides WordNet when the build
 * merges the two in order.
 */
export function parseGlossText(text: string, into = new Map<string, GlossEntry>()): Map<string, GlossEntry> {
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const [rawWord, pos, ...rest] = line.split('\t');
    const gloss = rest.join('\t').trim();
    const word = (rawWord ?? '').trim().toUpperCase();
    if (word === '' || pos === undefined || gloss === '') continue;
    into.set(word, { word, pos: pos.trim(), gloss });
  }
  return into;
}

/** Serialize entries to shard text — sorted, so a rebuild is byte-identical. */
export function formatGlossShard(entries: readonly GlossEntry[]): string {
  return [...entries]
    .sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
    .map((entry) => `${entry.word}\t${entry.pos}\t${entry.gloss}\n`)
    .join('');
}

/** Split a full glossary into its shards, indexed by shard number. */
export function shardGlossary(entries: Iterable<GlossEntry>): GlossEntry[][] {
  const shards: GlossEntry[][] = Array.from({ length: GLOSS_SHARD_COUNT }, () => []);
  for (const entry of entries) shards[glossShardOf(entry.word)]?.push(entry);
  return shards;
}

/** Build-time validation — a malformed entry must fail the build, not the app. */
export function assertGlossEntry(entry: GlossEntry): void {
  if (!/^[A-Z]{2,}$/.test(entry.word)) {
    throw new Error(`glossary: unplayable headword '${entry.word}'`);
  }
  if (!/^[a-z]+$/.test(entry.pos)) {
    throw new Error(`glossary: bad part of speech '${entry.pos}' for ${entry.word}`);
  }
  if (/[\t\n\r]/.test(entry.gloss)) {
    throw new Error(`glossary: gloss for ${entry.word} contains a tab or newline`);
  }
}
