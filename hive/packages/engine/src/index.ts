// @hive/engine — pure rules kernel. Zero runtime dependencies, no DOM, no React.
// This surface is FROZEN (IMPLEMENTATION.md §5): extend only with a DESIGN.md update.

export type Color = 'w' | 'b';
export type BugKind = 'Q' | 'A' | 'S' | 'G' | 'B' | 'M' | 'L' | 'P';

export interface TileId {
  color: Color;
  kind: BugKind;
  ordinal: 1 | 2 | 3; // e.g. wA2
}
export interface Hex {
  q: number;
  r: number;
} // axial, pointy-top
export type CellKey = string; // `${q},${r}`

export interface GameOptions {
  mosquito: boolean;
  ladybug: boolean;
  pillbug: boolean;
  tournamentOpening: boolean; // no queen as first tile
}

export type Move =
  | { type: 'place'; tile: TileId; to: Hex }
  | { type: 'move'; tile: TileId; from: Hex; to: Hex } // piece moves itself
  | { type: 'toss'; by: TileId; tile: TileId; from: Hex; to: Hex } // pillbug toss
  | { type: 'pass' };

export type GameResult =
  | { status: 'ongoing' }
  | { status: 'won'; winner: Color; by: 'surround' }
  | { status: 'draw'; by: 'surround' | 'repetition' };

export interface GameState {
  readonly options: GameOptions;
  readonly board: ReadonlyMap<CellKey, readonly TileId[]>; // stack bottom→top
  readonly hands: Readonly<Record<Color, Readonly<Record<BugKind, number>>>>;
  readonly toMove: Color;
  readonly turn: number; // per-player full turns, 1-based
  readonly lastMoved?: { tile: TileId; byPillbug: boolean };
  readonly passCount: number;
  readonly positionHashes: readonly bigint[];
}

export { initialState } from './state';
export { applyMove, IllegalMoveError, legalMoves, result } from './engine';
export { parseUhp, toUhp } from './uhp';
export { hash } from './zobrist';

// hex utilities (shared with the renderer/drag layer)
export { hexToPixel, neighbors, pixelToHex } from './hex';
