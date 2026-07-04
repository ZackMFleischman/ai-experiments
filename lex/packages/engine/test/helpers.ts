// Shared test helpers — deterministic bag orders (the engine never shuffles;
// bag order is an input, DESIGN §3.3).
import type { Ruleset, TileFace } from '../src/index.js';

/** Every tile of the set, in face-sorted order — a valid, boring bag order. */
export function canonicalBagOrder(ruleset: Ruleset): TileFace[] {
  const faces = Object.keys(ruleset.tiles.counts).sort() as TileFace[];
  const order: TileFace[] = [];
  for (const face of faces) {
    for (let i = 0; i < ruleset.tiles.counts[face]!; i++) order.push(face);
  }
  return order;
}

/** Deterministic permutation: rotate the canonical order by `shift`. */
export function rotatedBagOrder(ruleset: Ruleset, shift: number): TileFace[] {
  const order = canonicalBagOrder(ruleset);
  return [...order.slice(shift % order.length), ...order.slice(0, shift % order.length)];
}

/**
 * A full bag order that deals the given racks (seat order), then continues
 * with `bagPrefix`, then the remaining tiles in sorted order. Lets tests pin
 * exact racks and next draws while staying a legal permutation.
 */
export function riggedBagOrder(ruleset: Ruleset, racks: ReadonlyArray<readonly TileFace[]>, bagPrefix: readonly TileFace[] = []): TileFace[] {
  const remaining: Record<string, number> = {};
  for (const [face, count] of Object.entries(ruleset.tiles.counts)) remaining[face] = count;
  const take = (face: TileFace) => {
    if (!remaining[face]) throw new Error(`rigged order over-draws '${face}'`);
    remaining[face] -= 1;
    return face;
  };
  const order: TileFace[] = [];
  for (const rack of racks) for (const face of rack) order.push(take(face));
  for (const face of bagPrefix) order.push(take(face));
  for (const face of Object.keys(remaining).sort() as TileFace[]) {
    for (let i = 0; i < remaining[face]!; i++) order.push(face);
  }
  return order;
}

/** A dictionary stub: accepts everything except the listed words. */
export function stubDict(rejects: readonly string[] = []): { id: string; has(word: string): boolean } {
  const bad = new Set(rejects.map((w) => w.toUpperCase()));
  return { id: 'stub', has: (word: string) => !bad.has(word.toUpperCase()) };
}
