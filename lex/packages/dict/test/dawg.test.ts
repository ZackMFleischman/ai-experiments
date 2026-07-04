// T2.2: DAWG build + binary encode/decode — per-list equivalence against a
// reference Set, fuzzed negatives, and the ≤800 KB size budget
// (IMPLEMENTATION §2 M2).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDawg, decodeDawg } from '../src/dawg.js';
import { normalizeWordList } from '../src/wordlist.js';

const read = (name: string) => readFileSync(new URL(`../words/${name}`, import.meta.url), 'utf8');
const hashOf = (words: string[]) => createHash('sha256').update(words.join('\n')).digest('hex');

function loadList(file: string): string[] {
  return normalizeWordList(read(file));
}

describe('small-list round trip', () => {
  const words = normalizeWordList('cat\ncats\ncar\ncards\ndog\ndo\ndone\nzoo\n');
  const dict = decodeDawg(buildDawg(words, 'mini', hashOf(words)));

  it('carries id, hash, and word count', () => {
    expect(dict.id).toBe('mini');
    expect(dict.wordCount).toBe(words.length);
    expect(dict.sourceHash).toBe(hashOf(words));
  });

  it('accepts exactly the input words', () => {
    for (const word of words) expect(dict.has(word), word).toBe(true);
    for (const bogus of ['CA', 'CATS S', 'CARD', 'DONES', 'Z', 'ZOOS', 'ELEPHANT', '']) {
      expect(dict.has(bogus), bogus).toBe(false);
    }
  });

  it('is case-insensitive', () => {
    expect(dict.has('cat')).toBe(true);
    expect(dict.has('Cat')).toBe(true);
  });
});

describe.each([
  ['enable1.txt', 'enable1'],
  ['2of12inf.txt', '2of12inf'],
])('%s', (file, id) => {
  const words = loadList(file);
  const reference = new Set(words);
  const bytes = buildDawg(words, id, hashOf(words));
  const dict = decodeDawg(bytes);

  it('fits the ≤800 KB budget', () => {
    expect(bytes.byteLength).toBeLessThanOrEqual(800 * 1024);
  });

  it('is equivalent to the reference Set on every word', () => {
    expect(dict.wordCount).toBe(words.length);
    for (const word of words) {
      if (!dict.has(word)) throw new Error(`missing: ${word}`);
    }
  });

  it('rejects fuzzed negatives exactly like the reference Set', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // random letter strings
          fc.string({ unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), minLength: 2, maxLength: 12 }),
          // mutations of real words
          fc
            .tuple(fc.integer({ min: 0, max: words.length - 1 }), fc.integer({ min: 0, max: 25 }), fc.nat(14))
            .map(([wordIndex, letter, position]) => {
              const word = words[wordIndex]!;
              const change = String.fromCharCode(65 + letter);
              const cut = position % (word.length + 1);
              return word.slice(0, cut) + change + word.slice(cut + 1);
            }),
        ),
        (candidate) => dict.has(candidate) === reference.has(candidate),
      ),
      { numRuns: 2000 },
    );
  });
});
