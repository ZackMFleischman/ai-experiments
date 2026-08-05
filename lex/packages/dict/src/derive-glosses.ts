// Provenance tool for `words/wordnet-glosses.txt` (DESIGN §5.5) — run by hand
// when the gloss source is re-vendored, never as part of a build. WordNet ships
// synset records; the app wants one short gloss per single-word lemma, so this
// derives that projection deterministically:
//
//   1. read the four WordNet `data.*` files into synset-offset → gloss;
//   2. walk the `index.*` files, which list a lemma's synsets in SENSE ORDER,
//      and take sense 1 — the common meaning. (Reading data.* directly instead
//      gives file order, which is arbitrary: it defines CAT as the CAT scan.)
//      Single-word `[a-z]{2,}` lemmas only; multi-word entries carry '_' and
//      can't be played;
//   3. gloss = the first definition clause — WordNet appends further senses and
//      quoted usage examples after ';' — paren-balanced, ≤160 chars;
//   4. one entry per lemma, part of speech preferred noun > verb > adj > adv;
//   5. prune to lemmas some vendored word list can actually reach, directly or
//      through the same `morphBases` reductions the app applies at lookup time
//      (this is what drops proper nouns: no list contains them).
//
// Usage, from packages/dict:
//   npm pack wordnet-db && tar xzf wordnet-db-*.tgz     # WordNet 3.0 data files
//   pnpm derive:glosses package/dict
//
// It rewrites `words/wordnet-glosses.txt` in place — `word<TAB>pos<TAB>gloss`,
// LF, sorted. words/README.md pins its sha256; test/glossary.test.ts asserts it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { morphBases } from './morphology.js';
import { WORD_LIST_FILES } from './wordlist.js';

const dictDir = process.argv[2];
if (dictDir === undefined) {
  console.error('usage: pnpm derive:glosses <path-to-wordnet-dict-dir>');
  process.exit(2);
}

const POS_FILES = [
  ['noun', 'n'],
  ['verb', 'v'],
  ['adj', 'adj'],
  ['adv', 'adv'],
] as const;
const POS_RANK: Record<string, number> = { n: 0, v: 1, adj: 2, adv: 3 };
const MAX_GLOSS = 160;

/** First definition clause, with any clause-splitting paren left balanced. */
function firstClause(raw: string): string {
  let text = (raw.split(';')[0] ?? '').trim();
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
  }
  if (depth !== 0) text = text.slice(0, text.lastIndexOf('(')).trim();
  // WordNet quotes cited words TeX-style (`ooh'); normalize before trimming so
  // stripping a wrapper quote can't orphan the opening half of a citation.
  text = text.replace(/`([^'`]*)'/g, '"$1"').replace(/\s+/g, ' ').trim();
  if (/^"[^"]*"$/.test(text)) text = text.slice(1, -1).trim();
  return text.length > MAX_GLOSS ? `${text.slice(0, MAX_GLOSS - 3).trimEnd()}...` : text;
}

const best = new Map<string, { pos: string; gloss: string }>();
for (const [file, pos] of POS_FILES) {
  // data.<pos>: synset records, keyed by the offset the index files point at.
  const glossOf = new Map<string, string>();
  for (const line of readFileSync(join(dictDir, `data.${file}`), 'latin1').split('\n')) {
    if (line === '' || line.startsWith('  ')) continue; // licence header block
    const bar = line.indexOf('|');
    if (bar === -1) continue;
    const offset = line.slice(0, line.indexOf(' '));
    const gloss = firstClause(line.slice(bar + 1));
    if (gloss !== '') glossOf.set(offset, gloss);
  }

  // index.<pos>: lemma pos synset_cnt p_cnt [ptr…] sense_cnt tagsense_cnt
  //              synset_offset… — offsets in sense order, so [0] is sense 1.
  for (const line of readFileSync(join(dictDir, `index.${file}`), 'latin1').split('\n')) {
    if (line === '' || line.startsWith('  ')) continue;
    const fields = line.trim().split(/\s+/);
    const lemma = fields[0] ?? '';
    if (!/^[a-z]{2,}$/.test(lemma)) continue;
    const pointerCount = Number.parseInt(fields[3] ?? '', 10);
    if (!Number.isFinite(pointerCount)) continue;
    const gloss = glossOf.get(fields[6 + pointerCount] ?? '');
    if (gloss === undefined) continue;
    const current = best.get(lemma);
    if (!current || (POS_RANK[pos] ?? 9) < (POS_RANK[current.pos] ?? 9)) {
      best.set(lemma, { pos, gloss });
    }
  }
}

const wordsDir = new URL('../words/', import.meta.url);
const reachable = new Set<string>();
for (const [file] of WORD_LIST_FILES) {
  for (const line of readFileSync(new URL(file, wordsDir), 'latin1').split('\n')) {
    const word = line.trim().replace(/^[%!]+/, '').replace(/[%!]+$/, '').toUpperCase();
    if (!/^[A-Z]{2,}$/.test(word)) continue;
    for (const candidate of [word, ...morphBases(word)]) {
      const lemma = candidate.toLowerCase();
      if (best.has(lemma)) reachable.add(lemma);
    }
  }
}

const kept = [...reachable].sort();
const out = new URL('wordnet-glosses.txt', wordsDir);
writeFileSync(
  out,
  kept.map((word) => `${word}\t${best.get(word)?.pos}\t${best.get(word)?.gloss}\n`).join(''),
);
console.log(`${kept.length} lemmas kept of ${best.size} single-word glosses → ${out.pathname}`);
