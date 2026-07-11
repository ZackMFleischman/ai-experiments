// The engine's only randomness: a pure mulberry32 step threaded through the
// state (same generator as @parlor/solo's, but stepped functionally so the
// rng cursor lives *in* the game state and replays stay deterministic).
// Engines in this repo forbid Math.random — seeds come in via options.

/** One mulberry32 step: [value in [0,1), next cursor]. */
export function nextRand(cursor: number): [number, number] {
  const next = (cursor + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next >>> 0];
}

/** FNV-1a 32-bit, for deriving sub-seeds from strings. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
