// The dictionary registry (DESIGN §5.4): metadata for the FR-7 New Game
// picker plus the pinned source hashes that keep client and server on the
// same list version — loaders refuse an artifact whose id or hash differs.
import type { DawgDictionary } from './dawg.js';

export interface DictionaryInfo {
  id: string;
  name: string;
  description: string;
  wordCount: number;
}

interface RegistryEntry extends DictionaryInfo {
  /** sha256 of the normalized word list ('\n'-joined) — matches the DAWG header. */
  sourceHash: string;
}

const ENTRIES: readonly RegistryEntry[] = Object.freeze([
  Object.freeze({
    id: 'enable1',
    name: 'Tournament-style',
    description: 'ENABLE — the large tournament-flavored list. Strict but comprehensive.',
    wordCount: 172_823,
    sourceHash: 'c5a47930aa2750cad83706279bf96b952bbe467652b85cf64f94d621a0d41e47',
  }),
  Object.freeze({
    id: '2of12inf',
    name: 'Everyday words',
    description: 'The 12dicts common-vocabulary list with inflections. Friendlier for casual play.',
    wordCount: 81_883,
    sourceHash: '71194db1340c21c0c886ec38ee72211873530aea3575a709ed8f2c320b235a31',
  }),
]);

export const DICTIONARIES: readonly DictionaryInfo[] = Object.freeze(
  ENTRIES.map(({ sourceHash: _sourceHash, ...info }) => Object.freeze(info)),
);

export function registryEntry(id: string): RegistryEntry {
  const entry = ENTRIES.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`unknown dictionary '${id}' — not in the registry`);
  return entry;
}

/** Both loaders funnel through this: id + hash + count asserted (§5.4). */
export function verifyDictionary(dict: DawgDictionary, requestedId: string): DawgDictionary {
  const entry = registryEntry(requestedId);
  if (dict.id !== entry.id) {
    throw new Error(`dictionary artifact mismatch: asked for '${entry.id}', got '${dict.id}'`);
  }
  if (dict.sourceHash !== entry.sourceHash) {
    throw new Error(`dictionary '${entry.id}' hash mismatch — client/server list versions differ`);
  }
  if (dict.wordCount !== entry.wordCount) {
    throw new Error(`dictionary '${entry.id}' word count ${dict.wordCount} ≠ registry ${entry.wordCount}`);
  }
  return dict;
}
