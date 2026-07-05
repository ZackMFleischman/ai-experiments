// Sync node-side loader (`@lex/dict/node`): functions and node tests read
// the generated artifact from disk and verify it against the registry —
// same decoder, same assertions as the app loader (DESIGN §5.4). The
// functions deploy ships generated/*.dawg alongside the bundle (T4.9).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeDawg, type DawgDictionary } from './dawg.js';
import { verifyDictionary } from './registry.js';

// Lazy: import.meta.url is unavailable in the functions' CJS bundle, which
// always passes an explicit dir — only node-side tests use the default.
function defaultDir(): string {
  return fileURLToPath(new URL('../generated', import.meta.url));
}

export function loadDictionarySync(id: string, dir?: string): DawgDictionary {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`bad dictionary id '${id}'`);
  const bytes = readFileSync(`${dir ?? defaultDir()}/${id}.dawg`);
  return verifyDictionary(decodeDawg(new Uint8Array(bytes)), id);
}
