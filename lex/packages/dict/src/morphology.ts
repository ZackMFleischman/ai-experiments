// Morphological reduction for glossary lookups (DESIGN §5.5). Gloss sources
// define base forms — WordNet has CAT, not CATS — so a lookup for an inflected
// word walks these candidate reductions and takes the first that the glossary
// knows. Pure, zero-dep, deterministic: the same suffix table runs at
// derivation time (scripts/derive-glosses.mjs prunes with it) and at runtime,
// so what the build keeps is exactly what a lookup can reach.
//
// This is a spelling heuristic, never a legality one: the engine's DAWG is the
// only authority on whether a word is playable. A reduction that lands on a
// real lemma is *reported* to the player ("inflected form of CAT") precisely
// because the mapping is a guess, not a dictionary fact.

/** Suffix → replacement, longest/most specific first (Morphy's ordering). */
const RULES = Object.freeze([
  ['SES', 'S'],
  ['XES', 'X'],
  ['ZES', 'Z'],
  ['CHES', 'CH'],
  ['SHES', 'SH'],
  ['MEN', 'MAN'],
  ['IES', 'Y'],
  ['ES', 'E'],
  ['ES', ''],
  ['S', ''],
  ['IED', 'Y'],
  ['ED', 'E'],
  ['ED', ''],
  ['ING', 'E'],
  ['ING', ''],
  ['IEST', 'Y'],
  ['EST', 'E'],
  ['EST', ''],
  ['IER', 'Y'],
  ['ER', 'E'],
  ['ER', ''],
  ['ILY', 'Y'],
  ['LY', ''],
] as const);

const VOWELS = 'AEIOU';

/**
 * Candidate base forms for an uppercase A–Z word, most likely first, never
 * including the word itself and never shorter than two letters. Order is
 * stable; callers take the first candidate their glossary knows.
 */
export function morphBases(word: string): string[] {
  const bases: string[] = [];
  const add = (candidate: string): void => {
    if (candidate.length >= 2 && candidate !== word && !bases.includes(candidate)) {
      bases.push(candidate);
    }
  };
  for (const [suffix, replacement] of RULES) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, word.length - suffix.length);
    const candidate = stem + replacement;
    add(candidate);
    // RUNNING → RUN, BIGGEST → BIG: undo the doubled final consonant.
    const last = candidate[candidate.length - 1];
    if (
      candidate.length > 2 &&
      last !== undefined &&
      last === candidate[candidate.length - 2] &&
      !VOWELS.includes(last)
    ) {
      add(candidate.slice(0, -1));
    }
  }
  return bases;
}
