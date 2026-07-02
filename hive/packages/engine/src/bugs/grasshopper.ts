// Grasshopper: jumps in a straight line over ≥1 contiguous tiles (T1.6).
import { add, DIRECTIONS } from '../hex';
import type { Hex } from '../index';
import { type Board, isOccupied, removeTop } from '../state';

export function grasshopperDestinations(board: Board, from: Hex): Hex[] {
  const lifted = removeTop(board, from);
  const out: Hex[] = [];
  for (const dir of DIRECTIONS) {
    let cell = add(from, dir);
    if (!isOccupied(lifted, cell)) continue; // needs at least one tile to jump
    while (isOccupied(lifted, cell)) cell = add(cell, dir);
    out.push(cell);
  }
  return out;
}
