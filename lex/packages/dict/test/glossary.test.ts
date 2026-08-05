// T7.1: the vendored gloss sources and the sharding that ships them.
//
// The load-bearing test here is the two-letter guarantee: every two-letter word
// playable in ANY registry dictionary must have a definition, because those are
// the words players actually challenge and a third of them are absent from
// WordNet. If a re-vendor drops one, this fails — add it to
// words/curated-glosses.txt rather than relaxing the assertion.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertGlossEntry,
  formatGlossShard,
  GLOSS_SHARD_COUNT,
  glossShardOf,
  parseGlossText,
  shardGlossary,
  type GlossEntry,
} from '../src/glossary.js';
import { morphBases } from '../src/morphology.js';
import { normalizeWordList, WORD_LIST_FILES } from '../src/wordlist.js';

const read = (name: string) => readFileSync(new URL(`../words/${name}`, import.meta.url), 'utf8');

/** The merged glossary exactly as build-cli assembles it: curated wins. */
function glossary(): Map<string, GlossEntry> {
  const merged = parseGlossText(read('wordnet-glosses.txt'));
  return parseGlossText(read('curated-glosses.txt'), merged);
}

/** What a player gets when they tap a word: direct hit, else a reduced form. */
function definitionFor(word: string, entries: Map<string, GlossEntry>): GlossEntry | undefined {
  for (const candidate of [word, ...morphBases(word)]) {
    const entry = entries.get(candidate);
    if (entry) return entry;
  }
  return undefined;
}

describe('vendored gloss sources', () => {
  it('wordnet-glosses.txt content hash is pinned', () => {
    expect(createHash('sha256').update(readFileSync(new URL('../words/wordnet-glosses.txt', import.meta.url))).digest('hex')).toBe(
      '31735630c36cc00804bc0287b9cb965335071a88fff2d7a9523eacbe69b214cd',
    );
  });

  it('parses to 58,002 WordNet lemmas, every one a playable headword', () => {
    const entries = parseGlossText(read('wordnet-glosses.txt'));
    expect(entries.size).toBe(58_002);
    for (const entry of entries.values()) assertGlossEntry(entry);
  });

  it('curated entries override WordNet for the same word', () => {
    const wordnetOnly = parseGlossText(read('wordnet-glosses.txt'));
    const merged = glossary();
    // AA is an associate degree to WordNet; to a player it is jagged lava.
    expect(wordnetOnly.get('AA')?.gloss).not.toBe(merged.get('AA')?.gloss);
    expect(merged.get('AA')?.gloss).toContain('lava');
  });

  it('every curated entry is a well-formed two-letter word', () => {
    const curated = parseGlossText(read('curated-glosses.txt'));
    expect(curated.size).toBe(107);
    for (const entry of curated.values()) {
      assertGlossEntry(entry);
      expect(entry.word).toHaveLength(2);
    }
  });
});

describe('two-letter coverage (the guarantee)', () => {
  const entries = glossary();

  for (const [file, id] of WORD_LIST_FILES) {
    it(`defines every two-letter word in ${id}`, () => {
      const twos = normalizeWordList(read(file)).filter((word) => word.length === 2);
      expect(twos.length).toBeGreaterThan(0);
      const undefined_ = twos.filter((word) => !entries.has(word));
      expect(undefined_).toEqual([]);
    });
  }
});

describe('dictionary coverage', () => {
  const entries = glossary();

  // Not a target to optimize — a floor. WordNet defines base forms, so a
  // tournament list's inflected tail is thin; the UI links out for the rest.
  const FLOORS: Record<string, number> = { enable1: 0.6, '2of12inf': 0.9, nwl2023: 0.55 };

  for (const [file, id] of WORD_LIST_FILES) {
    it(`covers at least ${Math.round((FLOORS[id] ?? 0) * 100)}% of ${id}`, () => {
      const words = normalizeWordList(read(file));
      const covered = words.filter((word) => definitionFor(word, entries) !== undefined);
      expect(covered.length / words.length).toBeGreaterThanOrEqual(FLOORS[id] ?? 0);
    });
  }

  it('resolves inflected forms through their lemma', () => {
    expect(definitionFor('BANJOES', entries)?.word).toBe('BANJO');
    expect(definitionFor('QUIZZED', entries)?.word).toBe('QUIZ');
  });

  // WordNet has no ZYZZYVA; that is the link-out's job, not a coverage bug.
  it('reports nothing rather than guessing when no source defines the word', () => {
    expect(definitionFor('ZYZZYVAS', entries)).toBeUndefined();
  });
});

describe('sharding', () => {
  it('assigns every entry to exactly one shard, losing nothing', () => {
    const entries = [...glossary().values()];
    const shards = shardGlossary(entries);
    expect(shards).toHaveLength(GLOSS_SHARD_COUNT);
    expect(shards.reduce((n, shard) => n + shard.length, 0)).toBe(entries.length);
    for (const [index, shard] of shards.entries()) {
      for (const entry of shard) expect(glossShardOf(entry.word)).toBe(index);
    }
  });

  it('spreads entries evenly enough that no shard dominates', () => {
    const shards = shardGlossary(glossary().values());
    const average = shards.reduce((n, shard) => n + shard.length, 0) / GLOSS_SHARD_COUNT;
    for (const shard of shards) expect(shard.length).toBeLessThan(average * 1.5);
  });

  it('round-trips through the shard text format, sorted and stable', () => {
    const shard = shardGlossary(glossary().values())[0] ?? [];
    const text = formatGlossShard(shard);
    expect(formatGlossShard(shard)).toBe(text); // deterministic rebuild
    const parsed = parseGlossText(text);
    expect(parsed.size).toBe(shard.length);
    const words = [...parsed.keys()];
    expect(words).toEqual([...words].sort());
    for (const entry of shard) {
      expect(parsed.get(entry.word)).toEqual({ word: entry.word, pos: entry.pos, gloss: entry.gloss });
    }
  });

  it('hashes words the same way on every runtime', () => {
    expect(glossShardOf('QI')).toBe(glossShardOf('QI'));
    expect([...new Set(['AA', 'CAT', 'ZYZZYVA'].map(glossShardOf))].every((n) => n >= 0 && n < GLOSS_SHARD_COUNT)).toBe(true);
  });
});

describe('assertGlossEntry', () => {
  const valid: GlossEntry = { word: 'CAT', pos: 'n', gloss: 'a small domesticated feline' };

  it('accepts a well-formed entry', () => {
    expect(() => assertGlossEntry(valid)).not.toThrow();
  });

  it('rejects headwords that could never be played', () => {
    expect(() => assertGlossEntry({ ...valid, word: 'cat' })).toThrow(/unplayable headword/);
    expect(() => assertGlossEntry({ ...valid, word: 'A' })).toThrow(/unplayable headword/);
    expect(() => assertGlossEntry({ ...valid, word: "CAT'S" })).toThrow(/unplayable headword/);
  });

  it('rejects a bad part of speech or a gloss that would break the line format', () => {
    expect(() => assertGlossEntry({ ...valid, pos: 'Noun' })).toThrow(/part of speech/);
    expect(() => assertGlossEntry({ ...valid, gloss: 'a\tfeline' })).toThrow(/tab or newline/);
    expect(() => assertGlossEntry({ ...valid, gloss: 'a\nfeline' })).toThrow(/tab or newline/);
  });
});
