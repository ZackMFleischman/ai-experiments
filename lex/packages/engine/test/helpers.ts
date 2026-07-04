// Shared test helpers — deterministic bag orders (the engine never shuffles;
// bag order is an input, DESIGN §3.3).
import { checkPlay, type GameState, type Move, type Ruleset, type TileFace } from '../src/index.js';

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

/**
 * Deterministic brute-force placement search (stub-dict world): for each
 * tile-count k (desc), axis, and start cell, lay the first k rack tiles into
 * consecutive empty cells (stepping over occupied ones = bridging) and keep
 * whatever checkPlay accepts. Order is fully deterministic; blanks are
 * always designated 'E'. Used by the full-game fixture generator (T1.9) and
 * the property suite (T1.10).
 */
export function enumerateCandidatePlays(state: GameState, ruleset: Ruleset, capPerK = Infinity): Extract<Move, { type: 'play' }>[] {
  const rack = state.racks[state.toMove]!;
  const { rows, cols } = ruleset.board;
  const out: Extract<Move, { type: 'play' }>[] = [];
  for (let k = Math.min(rack.length, ruleset.rackSize); k >= 1; k--) {
    const faces = rack.slice(0, k);
    let found = 0;
    for (const axis of ['H', 'V'] as const) {
      const dRow = axis === 'V' ? 1 : 0;
      const dCol = axis === 'H' ? 1 : 0;
      for (let row = 0; row < rows && found < capPerK; row++) {
        for (let col = 0; col < cols && found < capPerK; col++) {
          const cells: { row: number; col: number }[] = [];
          let r = row;
          let c = col;
          while (cells.length < k && r < rows && c < cols) {
            if (!state.board.has(`${r},${c}`)) cells.push({ row: r, col: c });
            r += dRow;
            c += dCol;
          }
          if (cells.length < k) continue;
          const placements = faces.map((face, i) =>
            face === '?'
              ? { cell: cells[i]!, letter: 'E', isBlank: true }
              : { cell: cells[i]!, letter: face, isBlank: false },
          );
          if (checkPlay(state.board, rack, placements, ruleset).ok) {
            out.push({ type: 'play', placements });
            found += 1;
          }
        }
      }
    }
  }
  return out;
}
