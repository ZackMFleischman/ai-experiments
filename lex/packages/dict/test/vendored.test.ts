// T2.1: vendored-list pins — exact content hashes, word counts, and
// normalization invariants (IMPLEMENTATION §2 M2). If a vendored file
// changes, these fail loudly: bump deliberately, never silently.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeWordList } from '../src/wordlist.js';

const read = (name: string) => readFileSync(new URL(`../words/${name}`, import.meta.url));
const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

describe('enable1.txt', () => {
  const raw = read('enable1.txt');

  it('content hash is pinned', () => {
    expect(sha256(raw)).toBe('3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89');
  });

  it('normalizes to exactly 172,823 unique playable words', () => {
    const words = normalizeWordList(raw.toString('utf8'));
    expect(words).toHaveLength(172_823);
    expect(words).toContain('AA');
    expect(words).toContain('ZYZZYVAS');
    expect(words.every((w) => /^[A-Z]{2,}$/.test(w))).toBe(true);
  });
});

describe('2of12inf.txt', () => {
  const raw = read('2of12inf.txt');

  it('content hash is pinned', () => {
    expect(sha256(raw)).toBe('5fdcda90fd5193b4a98503e9d8eecbac3b1cc725f7f47aee082e06fa793c90e5');
  });

  it('normalizes (CRLF + %/! markers stripped) to exactly 81,883 unique words', () => {
    const words = normalizeWordList(raw.toString('utf8'));
    expect(words).toHaveLength(81_883);
    expect(words).toContain('AARDVARK');
    expect(words).toContain('ABANDONMENTS'); // '%'-marked uncountable plural kept
    expect(words).toContain('ABDUCTEE'); // '!'-marked neologism kept
    expect(words.every((w) => /^[A-Z]{2,}$/.test(w))).toBe(true);
    expect(new Set(words).size).toBe(words.length); // unique
  });
});

describe('normalizeWordList', () => {
  it('uppercases, strips markers/CR, drops empties and one-letter words, sorts, dedupes', () => {
    expect(normalizeWordList('cat\r\ndogs%\n!new\nnew\na\n\nzoo!\n')).toEqual(['CAT', 'DOGS', 'NEW', 'ZOO']);
  });

  it('throws on words that remain unplayable after normalization', () => {
    expect(() => normalizeWordList("don't\n")).toThrow(/unplayable/);
    expect(() => normalizeWordList('semi-dry\n')).toThrow(/unplayable/);
  });
});
