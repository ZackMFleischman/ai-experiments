// Async app loader (DESIGN §5.4): fetches the game's DAWG lazily (the SW
// caches it, T5.1) and verifies it against the registry. The functions-side
// sync variant lives in node.ts; both share decodeDawg + verifyDictionary.
import { decodeDawg, type DawgDictionary } from './dawg.js';
import { verifyDictionary } from './registry.js';

/** Where the app serves the generated artifacts from (copied at build, M3). */
const BASE_PATH = '/dict/';

export async function loadDictionary(id: string): Promise<DawgDictionary> {
  const response = await fetch(`${BASE_PATH}${encodeURIComponent(id)}.dawg`);
  if (!response.ok) {
    throw new Error(`dictionary '${id}' fetch failed: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return verifyDictionary(decodeDawg(bytes), id);
}
