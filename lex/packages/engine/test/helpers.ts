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
