// Zobrist-style position hashing (T1.10). The board is unbounded, so instead of
// a pretabulated random table the per-(cell, slot, tile) values come from a pure
// 64-bit mix function — deterministic across runs, no Date/random.
import { parseKey } from './hex';
import type { GameState } from './index';

const MASK = (1n << 64n) - 1n;

function splitmix64(x: bigint): bigint {
  x = (x + 0x9e3779b97f4a7c15n) & MASK;
  let z = x;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return (z ^ (z >> 31n)) & MASK;
}

const KIND_INDEX = { Q: 0, A: 1, S: 2, G: 3, B: 4, M: 5, L: 6, P: 7 } as const;
const BLACK_TO_MOVE = splitmix64(0x517cc1b727220a95n);

const zigzag = (n: number): bigint => BigInt(n < 0 ? -2 * n - 1 : 2 * n);

/** Hash over (cell, stack slot, tile) plus side-to-move. */
export function hash(state: GameState): bigint {
  let acc = state.toMove === 'b' ? BLACK_TO_MOVE : 0n;
  for (const [key, stack] of state.board) {
    const { q, r } = parseKey(key);
    const cell = (zigzag(q) << 21n) ^ zigzag(r);
    for (let slot = 0; slot < stack.length; slot++) {
      const t = stack[slot] as (typeof stack)[number];
      const tileIndex = (t.color === 'w' ? 0 : 24) + KIND_INDEX[t.kind] * 3 + (t.ordinal - 1);
      const seed = (cell << 13n) ^ (BigInt(slot) << 7n) ^ BigInt(tileIndex);
      acc ^= splitmix64(splitmix64(seed));
    }
  }
  return acc;
}
