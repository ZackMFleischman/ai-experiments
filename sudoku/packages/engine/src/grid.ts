// Grid geometry and validity. A grid is a plain 81-number array (0 = empty)
// so it serializes untouched through @parlor/solo's stored log.

export type Grid = readonly number[];

export const CELLS = 81;
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function rowOf(cell: number): number {
  return Math.floor(cell / 9);
}

export function colOf(cell: number): number {
  return cell % 9;
}

export function boxOf(cell: number): number {
  return Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
}

/** The 20 cells sharing a row, column, or box with each cell. */
export const PEERS: readonly (readonly number[])[] = (() => {
  const peers: number[][] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const set = new Set<number>();
    for (let other = 0; other < CELLS; other++) {
      if (other === cell) continue;
      if (rowOf(other) === rowOf(cell) || colOf(other) === colOf(cell) || boxOf(other) === boxOf(cell)) {
        set.add(other);
      }
    }
    peers.push([...set]);
  }
  return peers;
})();

export function emptyGrid(): number[] {
  return Array.from({ length: CELLS }, () => 0);
}

/** Digits that can legally go in `cell` given its peers (ignores the cell's
 * own current value). */
export function candidatesOf(grid: Grid, cell: number): number[] {
  const used = new Set<number>();
  for (const peer of PEERS[cell] as readonly number[]) {
    const v = grid[peer] as number;
    if (v !== 0) used.add(v);
  }
  return DIGITS.filter((d) => !used.has(d));
}

/** Cells whose value collides with a peer — the error-highlight set. */
export function conflictCells(grid: Grid): number[] {
  const out: number[] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const v = grid[cell] as number;
    if (v === 0) continue;
    const clash = (PEERS[cell] as readonly number[]).some((peer) => grid[peer] === v);
    if (clash) out.push(cell);
  }
  return out;
}

export function isComplete(grid: Grid): boolean {
  return grid.every((v) => v !== 0) && conflictCells(grid).length === 0;
}
