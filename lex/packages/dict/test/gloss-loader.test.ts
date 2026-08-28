// T8.1: the on-demand glossary loader — sharded fetch, memoization, and the
// distinction the UI depends on between "no definition for this word" (null)
// and "the glossary didn't load" (rejection).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupGloss, resetGlossCache } from '../src/gloss-loader.js';
import { formatGlossShard, glossShardOf, GLOSS_SHARD_COUNT, type GlossEntry } from '../src/glossary.js';

const ENTRIES: GlossEntry[] = [
  { word: 'QI', pos: 'n', gloss: 'the vital life force, in Chinese thought' },
  { word: 'CAT', pos: 'n', gloss: 'a small domesticated feline' },
  { word: 'QUIZ', pos: 'n', gloss: 'an examination consisting of a few short questions' },
];

/** A fetch that serves a manifest plus the shards those entries fall into. */
function serveGlossary(entries = ENTRIES) {
  const shards = new Map<number, GlossEntry[]>();
  for (const entry of entries) {
    const index = glossShardOf(entry.word);
    shards.set(index, [...(shards.get(index) ?? []), entry]);
  }
  const manifest = {
    version: 1,
    path: 'abc123',
    shardCount: GLOSS_SHARD_COUNT,
    entryCount: entries.length,
    sourceHash: 'abc123',
  };
  return vi.fn((url: string) => {
    if (url.endsWith('manifest.json')) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(manifest)) });
    }
    const index = Number(/\/(\d+)\.txt$/.exec(url)?.[1]);
    if (!Number.isFinite(index)) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(formatGlossShard(shards.get(index) ?? [])),
    });
  });
}

function install(fetchImpl: unknown): void {
  vi.stubGlobal('fetch', fetchImpl);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetGlossCache();
});

describe('lookupGloss', () => {
  it('returns the definition for a word the glossary defines', async () => {
    install(serveGlossary());
    expect(await lookupGloss('QI')).toEqual({
      word: 'QI',
      pos: 'n',
      gloss: 'the vital life force, in Chinese thought',
    });
  });

  it('accepts the word in any case, answering in the engine\'s uppercase', async () => {
    install(serveGlossary());
    expect((await lookupGloss('  qi '))?.word).toBe('QI');
  });

  it('resolves an inflected word through its base, and says which base', async () => {
    install(serveGlossary());
    expect(await lookupGloss('CATS')).toEqual({
      word: 'CATS',
      pos: 'n',
      gloss: 'a small domesticated feline',
      base: 'CAT',
    });
    expect((await lookupGloss('QUIZZED'))?.base).toBe('QUIZ');
  });

  it('returns null — not an error — when nothing defines the word', async () => {
    install(serveGlossary());
    expect(await lookupGloss('ZYZZYVA')).toBeNull();
  });

  it('returns null for input that is not a playable word', async () => {
    const fetchMock = serveGlossary();
    install(fetchMock);
    expect(await lookupGloss('A')).toBeNull();
    expect(await lookupGloss("CAT'S")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled(); // no round trip for junk input
  });

  it('fetches each shard once and the manifest once, however many lookups', async () => {
    const fetchMock = serveGlossary();
    install(fetchMock);
    await lookupGloss('QI');
    await lookupGloss('QI');
    await lookupGloss('QI');
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.endsWith('manifest.json'))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith(`${glossShardOf('QI')}.txt`))).toHaveLength(1);
  });

  it('requests shards under the manifest\'s content-addressed path', async () => {
    const fetchMock = serveGlossary();
    install(fetchMock);
    await lookupGloss('QI');
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(`/dict/gloss/abc123/${glossShardOf('QI')}.txt`);
  });

  it('rejects when the artifact cannot be loaded, so the UI can say so', async () => {
    install(vi.fn(() => Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') })));
    await expect(lookupGloss('QI')).rejects.toThrow(/glossary fetch failed/);
  });

  it('recovers after a transient failure instead of caching it forever', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('offline')));
    install(failing);
    await expect(lookupGloss('QI')).rejects.toThrow('offline');

    install(serveGlossary());
    expect((await lookupGloss('QI'))?.gloss).toContain('vital life force');
  });
});

/** Minimal in-memory stand-in for the Cache API surface the loader uses. */
function fakeCacheStorage() {
  const store = new Map<string, string>();
  const cache = {
    match: (url: string) =>
      Promise.resolve(store.has(url) ? { text: () => Promise.resolve(store.get(url) ?? '') } : undefined),
    put: (url: string, response: { text: () => Promise<string> }) =>
      response.text().then((text) => {
        store.set(url, text);
      }),
    keys: () => Promise.resolve([...store.keys()].map((url) => ({ url: `https://lex.test${url}` }))),
    delete: (request: { url: string }) => {
      store.delete(new URL(request.url).pathname);
      return Promise.resolve(true);
    },
  };
  return { caches: { open: () => Promise.resolve(cache) }, store };
}

describe('lookupGloss offline persistence', () => {
  it('serves a shard from the Cache API without touching the network again', async () => {
    const { caches: fakeCaches } = fakeCacheStorage();
    vi.stubGlobal('caches', fakeCaches);
    install(serveGlossary());
    await lookupGloss('QI');

    // New page load: memory caches are gone, the network is not available.
    resetGlossCache();
    install(vi.fn(() => Promise.reject(new Error('offline'))));
    expect((await lookupGloss('QI'))?.gloss).toContain('vital life force');
  });

  it('evicts shards left behind by a superseded glossary build', async () => {
    const { caches: fakeCaches, store } = fakeCacheStorage();
    vi.stubGlobal('caches', fakeCaches);
    store.set('/dict/gloss/oldpath/3.txt', 'STALE\tn\tfrom a previous build\n');
    install(serveGlossary());

    await lookupGloss('QI');
    expect([...store.keys()]).not.toContain('/dict/gloss/oldpath/3.txt');
    expect([...store.keys()]).toContain(`/dict/gloss/abc123/${glossShardOf('QI')}.txt`);
  });
});
