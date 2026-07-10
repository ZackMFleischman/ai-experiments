// Deterministic seed + PRNG utilities for solo games. Engines in this repo
// forbid Math.random (determinism is what makes replays, fixtures, and
// puzzle-of-the-day possible); games derive a seed here and thread the rng
// through. mulberry32 is tiny, fast, and plenty for puzzle shuffling — this
// is not cryptography and must never be used as such.

/** Local-calendar day key ('2026-07-10') — the daily puzzle rolls over at the
 * player's local midnight, matching their idea of "today's puzzle". */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a 32-bit — spreads short strings ('2026-07-10', 'daily:hard') into
 * well-distributed uint32 seeds. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: seeded PRNG over [0, 1). Same seed, same sequence, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, bound). */
export function randomInt(rng: () => number, bound: number): number {
  return Math.floor(rng() * bound);
}

/** Fisher–Yates over a copy; deterministic under a seeded rng. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
