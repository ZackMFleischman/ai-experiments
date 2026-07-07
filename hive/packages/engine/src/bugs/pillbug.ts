// Pillbug (T2.2): self-moves are queen-shaped (registry maps P to the queen
// generator); this module generates the tosses. Constraints per DESIGN §2.2:
// unstacked targets only (never a covered/covering tile), never the last-moved
// piece, one-hive respected, and both toss steps obey the freedom-to-move rule.
// The tossed piece climbs up onto the pillbug and back down, so each step is a
// beetle-style climb: it is blocked only by a gate ABOVE ground level — both
// gate cells stacked to height ≥ 2 (`canSlide`). A single ground-level tile in a
// gate cell never blocks the toss (the piece rides over it on top of the
// pillbug). This is the shared freedom-to-move predicate, same as beetle climbs.
import { hexEquals, neighbors } from '../hex';
import type { GameState, Hex, Move, TileId } from '../index';
import { canDepart, canSlide } from '../rules';
import { isOccupied, removeTop, stackAt, tileEquals } from '../state';

/** Tosses available to the pillbug (or pillbug-copying mosquito) `by` sitting at
 * `pCell`. The tosser's own stun is handled by the caller (a stunned pillbug may
 * not use its ability); this generator assumes `by` is free to act. */
export function pillbugTosses(
  state: GameState,
  pCell: Hex,
  by: TileId,
): Array<Extract<Move, { type: 'toss' }>> {
  const board = state.board;
  const moves: Array<Extract<Move, { type: 'toss' }>> = [];
  const empties = neighbors(pCell).filter((n) => !isOccupied(board, n));
  if (empties.length === 0) return moves;

  for (const t of neighbors(pCell)) {
    const stack = stackAt(board, t);
    if (stack.length !== 1) continue; // never a covered or covering piece
    const tile = stack[0] as TileId;
    if (state.lastMoved && tileEquals(state.lastMoved.tile, tile)) continue; // just moved / stunned
    if (!canDepart(board, t)) continue; // one-hive
    const lifted = removeTop(board, t);
    if (!canSlide(lifted, t, pCell)) continue; // up over the pillbug
    for (const d of empties) {
      if (hexEquals(d, t)) continue;
      if (!canSlide(lifted, pCell, d)) continue; // down the other side
      moves.push({ type: 'toss', by, tile, from: t, to: d });
    }
  }
  return moves;
}
