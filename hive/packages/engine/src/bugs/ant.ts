// Ant: slides any distance around the perimeter — BFS closure over slide steps (T1.7).
import { cellKey, neighbors } from '../hex';
import type { Hex } from '../index';
import { canSlide } from '../rules';
import { type Board, isOccupied, removeTop } from '../state';

export function antDestinations(board: Board, from: Hex): Hex[] {
  const lifted = removeTop(board, from);
  const startKey = cellKey(from);
  const seen = new Set<string>([startKey]);
  const queue: Hex[] = [from];
  const out: Hex[] = [];

  while (queue.length > 0) {
    const cell = queue.shift() as Hex;
    for (const n of neighbors(cell)) {
      const nk = cellKey(n);
      if (seen.has(nk) || isOccupied(lifted, n) || !canSlide(lifted, cell, n)) continue;
      seen.add(nk);
      queue.push(n);
      out.push(n);
    }
  }
  return out;
}
