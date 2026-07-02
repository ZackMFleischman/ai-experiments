// Placement legality (T1.3), one-hive (T1.4), freedom-to-move gates (T1.5).
import { add, cellKey, DIRECTIONS, neighbors } from './hex';
import type { BugKind, GameState, Hex, Move, TileId } from './index';
import { type Board, BUG_KINDS, isOccupied, topTile } from './state';

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

export { add, DIRECTIONS, neighbors, ORIGIN };
