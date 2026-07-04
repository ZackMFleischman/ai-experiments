// Word-list normalization shared by the DAWG build script and the vendored
// pins (T2.1). Input: a raw vendored list (any line endings; 12dicts marker
// suffixes/prefixes '%' = uncountable plural, '!' = neologism — the WORDS are
// playable, the markers are annotations). Output: sorted unique uppercase
// A–Z words of length ≥ 2.
export function normalizeWordList(text: string): string[] {
  const words = new Set<string>();
  for (const line of text.split('\n')) {
    const stripped = line.trim().replace(/^[%!]+/, '').replace(/[%!]+$/, '');
    if (stripped === '') continue;
    const word = stripped.toUpperCase();
    if (word.length === 1) continue; // single letters are never playable
    if (!/^[A-Z]+$/.test(word)) {
      throw new Error(`unplayable word after normalization: '${line.trim()}'`);
    }
    words.add(word);
  }
  return [...words].sort();
}
