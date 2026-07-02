// Beetle: steps one cell in any direction, may climb on top of the hive (T1.6).
// Covered-tile freezing falls out of the engine only ever moving stack TOPS.
import { neighbors } from '../hex';
import type { Hex } from '../index';
import { canSlide } from '../rules';
import { type Board, removeTop } from '../state';

export function beetleDestinations(board: Board, from: Hex): Hex[] {
  // canSlide covers every case: ground-to-ground steps follow the slide rule
  // (exactly one gate → keeps hive contact), any step involving height uses the
  // beetle-gate rule, and occupied destinations are climbs.
  const lifted = removeTop(board, from);
  return neighbors(from).filter((n) => canSlide(lifted, from, n));
}
