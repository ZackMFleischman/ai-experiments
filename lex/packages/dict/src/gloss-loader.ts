// Async glossary loader (DESIGN §5.5) — the browser half of word definitions,
// mirroring loader.ts: fetch on demand, memoize in memory, persist in the Cache
// API so a looked-up shard survives a reload and works offline. A lookup pulls
// one ~20 KB shard (gzipped) rather than the 3.5 MB glossary, so the first
// definition a player taps costs about what a board image costs.
//
// Two failure shapes, and the UI renders them differently: `null` means the
// glossary simply has no entry for that word (the vendored gloss source covers
// ~65% of a tournament list — the rest is a Wiktionary link-out), while a
// rejection means the artifact itself couldn't be loaded (offline on a cold
// cache, a bad deploy). Never conflate the two: "no definition for ZA" and
// "definitions aren't loading" are different things to tell a player.
import {
  GLOSS_BASE_PATH,
  parseGlossText,
  glossShardOf,
  type GlossEntry,
  type GlossManifest,
} from './glossary.js';
import { morphBases } from './morphology.js';

/**
 * Shards are cached by the page, not the service worker: `sw.ts` is stamped
 * glue shared across the duo games (registry/stamped-manifest.mjs) and a
 * lex-only caching rule has no business in it. The Cache API gives the same
 * offline guarantee from here, and the content-addressed shard path makes the
 * policy trivial — shards are immutable, so cache-first is always correct.
 */
const CACHE_NAME = 'lex-gloss-v1';
const MANIFEST_PATH = `${GLOSS_BASE_PATH}manifest.json`;

// This package compiles against ES2022 + node types, no DOM (the engine and the
// DAWG loader need none), so the two Cache API calls used here are declared
// rather than paid for with the whole DOM lib.
interface GlossCache {
  match(url: string): Promise<{ text(): Promise<string> } | undefined>;
  put(url: string, response: Response): Promise<void>;
  keys(): Promise<readonly { url: string }[]>;
  delete(request: { url: string }): Promise<boolean>;
}
declare const caches: { open(name: string): Promise<GlossCache> } | undefined;

let manifestPromise: Promise<GlossManifest> | null = null;
const shardPromises = new Map<number, Promise<Map<string, GlossEntry>>>();

/** The Cache API, when the runtime has it (absent in tests and insecure contexts). */
async function glossCache(): Promise<GlossCache | null> {
  if (typeof caches === 'undefined' || !caches) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // storage denied (private mode, quota) — degrade to network
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`glossary fetch failed: ${url} (${response.status})`);
  return response.text();
}

/** Cache-first: only ever called for immutable, content-addressed shard URLs. */
async function immutableText(url: string): Promise<string> {
  const cache = await glossCache();
  const hit = await cache?.match(url);
  if (hit) return hit.text();
  const text = await fetchText(url);
  await cache?.put(url, new Response(text)).catch(() => {}); // quota is not fatal
  return text;
}

/**
 * Drop shards from superseded builds — content-addressing keeps them valid but
 * useless. Shards only: the cached manifest is what makes a cold offline start
 * work at all, and it lives at the base path rather than under a build's.
 */
async function pruneStaleShards(path: string): Promise<void> {
  const cache = await glossCache();
  if (!cache) return;
  const current = `${GLOSS_BASE_PATH}${path}/`;
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    if (pathname === MANIFEST_PATH || !pathname.startsWith(GLOSS_BASE_PATH)) continue;
    if (!pathname.startsWith(current)) await cache.delete(request).catch(() => {});
  }
}

function manifest(): Promise<GlossManifest> {
  // Network-first, cache-fallback: the manifest is the one mutable file here,
  // so a redeploy must be able to move the shard path — but a cold offline
  // start still gets to answer from whatever the player looked up before.
  manifestPromise ??= fetchText(MANIFEST_PATH)
    .then(async (text) => {
      const cache = await glossCache();
      await cache?.put(MANIFEST_PATH, new Response(text)).catch(() => {});
      return text;
    })
    .catch(async (error: unknown) => {
      const cached = await (await glossCache())?.match(MANIFEST_PATH);
      if (cached) return cached.text();
      throw error;
    })
    .then((text) => JSON.parse(text) as GlossManifest)
    .then((parsed) => {
      if (parsed.version !== 1) throw new Error(`glossary manifest version ${parsed.version}`);
      void pruneStaleShards(parsed.path); // fire-and-forget housekeeping
      return parsed;
    })
    .catch((error: unknown) => {
      manifestPromise = null; // a transient failure must not poison later lookups
      throw error;
    });
  return manifestPromise;
}

function shard(index: number): Promise<Map<string, GlossEntry>> {
  let pending = shardPromises.get(index);
  if (!pending) {
    pending = manifest()
      .then((info) => immutableText(`${GLOSS_BASE_PATH}${info.path}/${index}.txt`))
      .then((text) => parseGlossText(text))
      .catch((error: unknown) => {
        shardPromises.delete(index);
        throw error;
      });
    shardPromises.set(index, pending);
  }
  return pending;
}

/**
 * The definition for a played word, or `null` when the glossary has none.
 *
 * The word is looked up as played first, then through `morphBases` — gloss
 * sources define CAT, not CATS. A gloss found that way carries `base`, and the
 * UI has to show it: the reduction is a spelling heuristic, and the player
 * deserves to see which word was actually defined.
 *
 * Rejects when the glossary artifact can't be loaded (see the note above).
 */
export async function lookupGloss(word: string): Promise<GlossEntry | null> {
  const target = word.trim().toUpperCase();
  if (!/^[A-Z]{2,}$/.test(target)) return null;
  for (const candidate of [target, ...morphBases(target)]) {
    const entry = (await shard(glossShardOf(candidate))).get(candidate);
    if (entry) {
      return candidate === target ? { ...entry, word: target } : { ...entry, word: target, base: candidate };
    }
  }
  return null;
}

/** Test seam: drops the memoized manifest and shards. */
export function resetGlossCache(): void {
  manifestPromise = null;
  shardPromises.clear();
}
