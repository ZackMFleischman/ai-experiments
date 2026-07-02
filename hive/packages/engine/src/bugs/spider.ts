// Spider: slides exactly three cells around the perimeter, never revisiting a
// cell (including its start) — DFS with a path-visited set (T1.7).
import { cellKey, neighbors } from '../hex';
import type { Hex } from '../index';
import { canSlide } from '../rules';
import { type Board, isOccupied, removeTop } from '../state';

export function spiderDestinations(board: Board, from: Hex): Hex[] {
  const lifted = removeTop(board, from);
  const out = new Map<string, Hex>();

  const walk = (cell: Hex, depth: number, visited: Set<string>) => {
    if (depth === 3) {
      out.set(cellKey(cell), cell);
      return;
    }
    for (const n of neighbors(cell)) {
      const nk = cellKey(n);
      if (visited.has(nk) || isOccupied(lifted, n) || !canSlide(lifted, cell, n)) continue;
      visited.add(nk);
      walk(n, depth + 1, visited);
      visited.delete(nk);
    }
  };

  walk(from, 0, new Set([cellKey(from)]));
  return [...out.values()];
}
