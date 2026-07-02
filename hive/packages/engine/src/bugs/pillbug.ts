// Pillbug (T2.2): self-moves are queen-shaped (registry maps P to the queen
// generator); this module generates the tosses. Constraints per DESIGN §2.2:
// height-1 targets only (never stacked), never the last-moved piece, one-hive
// respected, and both toss steps obey the height-1 gate rule — the tossed piece
// travels at height one, so a step is blocked when BOTH its gate cells are
// occupied at all (stricter than the beetle's strictly-taller rule).
import { hexEquals, neighbors } from '../hex';
import type { GameState, Hex, Move, TileId } from '../index';
import { canDepart, commonNeighbors } from '../rules';
import { type Board, isOccupied, removeTop, stackAt, tileEquals } from '../state';

function gateOpenAtHeightOne(board: Board, from: Hex, to: Hex): boolean {
  const [g1, g2] = commonNeighbors(from, to);
  return !(isOccupied(board, g1) && isOccupied(board, g2));
}

/** Tosses available to the pillbug (or pillbug-copying mosquito) `by` sitting
 * at `pCell`. Its own stun does not matter — a stunned pillbug may still toss. */
export function pillbugTosses(state: GameState, pCell: Hex, by: TileId): Move[] {
  const board = state.board;
  const moves: Move[] = [];
  const empties = neighbors(pCell).filter((n) => !isOccupied(board, n));
  if (empties.length === 0) return moves;

  for (const t of neighbors(pCell)) {
    const stack = stackAt(board, t);
    if (stack.length !== 1) continue; // never a covered or covering piece
    const tile = stack[0] as TileId;
    if (state.lastMoved && tileEquals(state.lastMoved.tile, tile)) continue; // just moved / stunned
    if (!canDepart(board, t)) continue; // one-hive
    const lifted = removeTop(board, t);
    if (!gateOpenAtHeightOne(lifted, t, pCell)) continue; // up over the pillbug
    for (const d of empties) {
      if (hexEquals(d, t)) continue;
      if (!gateOpenAtHeightOne(lifted, pCell, d)) continue; // down the other side
      moves.push({ type: 'toss', by, tile, from: t, to: d });
    }
  }
  return moves;
}
