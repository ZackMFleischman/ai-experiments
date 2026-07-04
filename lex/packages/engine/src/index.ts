// @lex/engine — pure rules kernel (zero dependencies, deterministic).
// The frozen API surface (IMPLEMENTATION.md §5) lands with M1; these are the
// T0.1 placeholder types.

export type Letter = string; // 'A'–'Z'
export type TileFace = Letter | '?'; // '?' = blank (in rack/bag)
export interface Cell {
  row: number;
  col: number;
} // 0-based
export type CellKey = string; // `${row},${col}`
export type Seat = number; // 0-based player index
