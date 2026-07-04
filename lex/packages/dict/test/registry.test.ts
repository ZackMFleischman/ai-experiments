// T2.3: registry metadata matches the vendored files; both loaders verify
// id + hash + count through the shared decoder (IMPLEMENTATION §2 M2).
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DICTIONARIES, loadDictionary } from '../src/index.js';
import { loadDictionarySync } from '../src/node.js';
import { buildDawg } from '../src/dawg.js';
import { registryEntry } from '../src/registry.js';
import { normalizeWordList } from '../src/wordlist.js';

const readWords = (name: string) => readFileSync(new URL(`../words/${name}`, import.meta.url), 'utf8');
const hashOf = (words: string[]) => createHash('sha256').update(words.join('\n')).digest('hex');

function artifactFor(id: string): Uint8Array {
  const words = normalizeWordList(readWords(`${id}.txt`));
  return buildDawg(words, id, hashOf(words));
}

describe('DICTIONARIES registry', () => {
  it('lists exactly the two v1 dictionaries for the picker', () => {
    expect(DICTIONARIES.map((d) => d.id)).toEqual(['enable1', '2of12inf']);
    for (const info of DICTIONARIES) {
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
      expect(Object.keys(info).sort()).toEqual(['description', 'id', 'name', 'wordCount']);
      expect(Object.isFrozen(info)).toBe(true);
    }
  });

  it('metadata matches the vendored files (count + hash recomputed)', () => {
    for (const info of DICTIONARIES) {
      const words = normalizeWordList(readWords(`${info.id}.txt`));
      expect(words.length, info.id).toBe(info.wordCount);
      expect(hashOf(words), info.id).toBe(registryEntry(info.id).sourceHash);
    }
  });
});

describe('async app loader', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches, decodes, verifies, and returns a working dictionary', async () => {
    const bytes = artifactFor('2of12inf');
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('/dict/2of12inf.dawg');
      return new Response(bytes);
    });
    vi.stubGlobal('fetch', fetchMock);
    const dict = await loadDictionary('2of12inf');
    expect(dict.id).toBe('2of12inf');
    expect(dict.has('aardvark')).toBe(true);
    expect(dict.has('XQZZY')).toBe(false);
  });

  it('rejects an artifact whose id does not match the request', async () => {
    vi.stubGlobal('fetch', async () => new Response(artifactFor('enable1')));
    // a server bug serving the wrong file must not go unnoticed
    await expect(loadDictionary('2of12inf')).rejects.toThrow(/mismatch/);
  });

  it('rejects unknown ids and failed fetches', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }));
    await expect(loadDictionary('klingon')).rejects.toThrow(/fetch failed|unknown/);
    await expect(loadDictionary('enable1')).rejects.toThrow(/fetch failed/);
  });

  it('rejects a tampered artifact (hash mismatch)', async () => {
    const words = normalizeWordList('cat\ndog\n');
    const forged = buildDawg(words, 'enable1', hashOf(words));
    vi.stubGlobal('fetch', async () => new Response(forged));
    await expect(loadDictionary('enable1')).rejects.toThrow(/hash mismatch|word count/);
  });
});

describe('sync node loader', () => {
  it('reads a generated artifact from disk and verifies it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lex-dict-'));
    writeFileSync(join(dir, 'enable1.dawg'), artifactFor('enable1'));
    const dict = loadDictionarySync('enable1', dir);
    expect(dict.has('ZYZZYVAS')).toBe(true);
    expect(dict.has('ZZZZ')).toBe(false);
  });

  it('rejects path-traversal-ish ids', () => {
    expect(() => loadDictionarySync('../evil')).toThrow(/bad dictionary id/);
  });
});
