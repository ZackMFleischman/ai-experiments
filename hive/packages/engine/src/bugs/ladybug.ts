// Ladybug: exactly two steps on top of the hive, then one step down to an empty
// cell — every step gate-checked at height (T2.1). Never back to its own start.
import { cellKey, hexEquals, neighbors } from '../hex';
import type { Hex } from '../index';
import { canSlide } from '../rules';
import { type Board, isOccupied, removeTop } from '../state';

export function ladybugDestinations(board: Board, from: Hex): Hex[] {
  const lifted = removeTop(board, from);
  const out = new Map<string, Hex>();
  for (const c1 of neighbors(from)) {
    if (!isOccupied(lifted, c1) || !canSlide(lifted, from, c1)) continue;
    for (const c2 of neighbors(c1)) {
      if (!isOccupied(lifted, c2) || !canSlide(lifted, c1, c2)) continue;
      for (const c3 of neighbors(c2)) {
        if (isOccupied(lifted, c3) || hexEquals(c3, from) || !canSlide(lifted, c2, c3)) continue;
        out.set(cellKey(c3), c3);
      }
    }
  }
  return [...out.values()];
}
