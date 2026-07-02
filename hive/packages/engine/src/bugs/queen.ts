// Queen: slides exactly one cell (T1.6).
import { neighbors } from '../hex';
import type { Hex } from '../index';
import { canSlide } from '../rules';
import { type Board, isOccupied, removeTop } from '../state';

export function queenDestinations(board: Board, from: Hex): Hex[] {
  const lifted = removeTop(board, from);
  return neighbors(from).filter((n) => !isOccupied(lifted, n) && canSlide(lifted, from, n));
}
