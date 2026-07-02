// Placement legality (T1.3), one-hive (T1.4), freedom-to-move gates (T1.5).
import { add, cellKey, DIRECTIONS, neighbors } from './hex';
import type { BugKind, GameState, Hex, Move, TileId } from './index';
import { type Board, BUG_KINDS, heightAt, isOccupied, topTile } from './state';

const ORIGIN: Hex = { q: 0, r: 0 };

/** Empty cells adjacent to at least one occupied cell. */
export function fringe(board: Board): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const key of board.keys()) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    for (const n of neighbors({ q, r })) {
      const nk = cellKey(n);
      if (seen.has(nk) || board.has(nk)) continue;
      seen.add(nk);
      out.push(n);
    }
  }
  return out;
}

function nextOrdinal(state: GameState, kind: BugKind): TileId['ordinal'] {
  const initial = { Q: 1, A: 3, S: 2, G: 3, B: 2, M: 1, L: 1, P: 1 }[kind];
  return (initial - state.hands[state.toMove][kind] + 1) as TileId['ordinal'];
}

/** All legal `place` moves for the side to move (T1.3). */
export function placements(state: GameState): Move[] {
  const { board, toMove, turn, options } = state;
  const hand = state.hands[toMove];

  let kinds = BUG_KINDS.filter((k) => hand[k] > 0);
  // Queen rule: must be down by your 4th turn (still binding after forced passes).
  if (turn >= 4 && hand.Q > 0) kinds = ['Q'];
  // Tournament opening: no queen as either player's first tile.
  if (options.tournamentOpening && turn === 1) kinds = kinds.filter((k) => k !== 'Q');

  let cells: Hex[];
  if (board.size === 0) {
    cells = [ORIGIN];
  } else if (turn === 1) {
    // Black's first placement: anywhere adjacent (the only time touching the
    // opponent is allowed).
    cells = fringe(board);
  } else {
    cells = fringe(board).filter((cell) => {
      let ownContact = false;
      for (const n of neighbors(cell)) {
        const top = topTile(board, n);
        if (!top) continue;
        if (top.color !== toMove) return false; // covered cells count as the covering color
        ownContact = true;
      }
      return ownContact;
    });
  }

  const moves: Move[] = [];
  for (const kind of kinds) {
    const tile: TileId = { color: toMove, kind, ordinal: nextOrdinal(state, kind) };
    for (const to of cells) moves.push({ type: 'place', tile, to });
  }
  return moves;
}

/** Articulation (cut-vertex) cells of the occupancy graph — iterative DFS
 * (Hopcroft–Tarjan low-link), T1.4. Hives are ≤ 28 cells; O(V+E) per call. */
export function articulationCells(board: Board): Set<string> {
  const cuts = new Set<string>();
  const keys = [...board.keys()];
  if (keys.length === 0) return cuts;

  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const childCount = new Map<string, number>();
  let timer = 0;

  const rootKey = keys[0] as string;
  // Explicit stack of [key, neighborIndex]; neighbors materialized per node.
  const adjacency = (key: string): string[] => {
    const [q, r] = key.split(',').map(Number) as [number, number];
    return neighbors({ q, r })
      .map(cellKey)
      .filter((nk) => board.has(nk));
  };
  const stack: Array<{ key: string; adj: string[]; i: number }> = [
    { key: rootKey, adj: adjacency(rootKey), i: 0 },
  ];
  disc.set(rootKey, timer);
  low.set(rootKey, timer);
  timer += 1;
  parent.set(rootKey, null);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as { key: string; adj: string[]; i: number };
    if (frame.i < frame.adj.length) {
      const next = frame.adj[frame.i] as string;
      frame.i += 1;
      if (!disc.has(next)) {
        parent.set(next, frame.key);
        childCount.set(frame.key, (childCount.get(frame.key) ?? 0) + 1);
        disc.set(next, timer);
        low.set(next, timer);
        timer += 1;
        stack.push({ key: next, adj: adjacency(next), i: 0 });
      } else if (next !== parent.get(frame.key)) {
        low.set(frame.key, Math.min(low.get(frame.key) as number, disc.get(next) as number));
      }
    } else {
      stack.pop();
      const p = parent.get(frame.key);
      if (p != null) {
        low.set(p, Math.min(low.get(p) as number, low.get(frame.key) as number));
        if (parent.get(p) != null && (low.get(frame.key) as number) >= (disc.get(p) as number)) {
          cuts.add(p);
        }
      }
    }
  }
  if ((childCount.get(rootKey) ?? 0) >= 2) cuts.add(rootKey);
  return cuts;
}

/** May the top tile at `from` leave its cell without splitting the hive?
 * Tops of stacks (height ≥ 2) are never articulation-blocked. */
export function canDepart(board: Board, from: Hex): boolean {
  const stack = board.get(cellKey(from));
  if (!stack || stack.length === 0) return false;
  if (stack.length >= 2) return true;
  return !articulationCells(board).has(cellKey(from));
}

// Hex ring in rotational order; the two gate cells of a step in direction d are
// the ring neighbors of d (computed by lookup — this is the hottest path in
// move generation).
const RING: readonly Hex[] = [
  { q: 1, r: 0 }, // E
  { q: 0, r: 1 }, // SE
  { q: -1, r: 1 }, // SW
  { q: -1, r: 0 }, // W
  { q: 0, r: -1 }, // NW
  { q: 1, r: -1 }, // NE
];
const RING_INDEX = new Map(RING.map((d, i) => [`${d.q},${d.r}`, i]));

/** The two cells adjacent to both of an adjacent pair. */
export function commonNeighbors(a: Hex, b: Hex): [Hex, Hex] {
  const i = RING_INDEX.get(`${b.q - a.q},${b.r - a.r}`);
  if (i === undefined) throw new Error(`cells ${cellKey(a)} and ${cellKey(b)} are not adjacent`);
  const g1 = RING[(i + 1) % 6] as Hex;
  const g2 = RING[(i + 5) % 6] as Hex;
  return [add(a, g1), add(a, g2)];
}

/** Freedom-to-move (T1.5): may a tile slide/step from `from` to adjacent `to`?
 * The moving tile must ALREADY be lifted off the board. One predicate serves
 * ground slides, beetle climbs (up/down) and pillbug tosses:
 * - at ground level (both stacks empty) the piece must pivot around exactly one
 *   occupied gate cell — two occupied gates pinch it, zero lose hive contact;
 * - at height, the step is blocked only when BOTH gate stacks are strictly
 *   higher than both the origin (after lift) and the destination. */
export function canSlide(board: Board, from: Hex, to: Hex): boolean {
  const [g1, g2] = commonNeighbors(from, to);
  const h1 = heightAt(board, g1);
  const h2 = heightAt(board, g2);
  const a = heightAt(board, from);
  const b = heightAt(board, to);
  if (a === 0 && b === 0) return (h1 > 0) !== (h2 > 0);
  return Math.min(h1, h2) <= Math.max(a, b);
}

export { add, DIRECTIONS, neighbors, ORIGIN };
