import type { Color, GameOptions, GameState, Hex, Move, TileId } from '../src/index';
import { initialState, type Board, parseTileKey, placeTile } from '../src/state';

export const ALL_ON: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};
export const BASE: GameOptions = {
  mosquito: false,
  ladybug: false,
  pillbug: false,
  tournamentOpening: false,
};

/** Cells as `[q, r, 'wQ1', 'bB1', …]` (stack bottom→top). Hands are derived by
 * subtracting placed tiles from the initial set, so tile conservation holds. */
export function buildState(
  cells: Array<[number, number, ...string[]]>,
  overrides: Partial<Pick<GameState, 'toMove' | 'turn' | 'lastMoved' | 'passCount' | 'hands'>> & {
    options?: GameOptions;
  } = {},
): GameState {
  const options = overrides.options ?? ALL_ON;
  const base = initialState(options);
  let board: Board = new Map();
  const hands = { w: { ...base.hands.w }, b: { ...base.hands.b } };
  for (const [q, r, ...tiles] of cells) {
    for (const key of tiles) {
      const tile = parseTileKey(key);
      board = placeTile(board, { q, r }, tile);
      hands[tile.color][tile.kind] -= 1;
      if (hands[tile.color][tile.kind] < 0) throw new Error(`too many ${tile.color}${tile.kind} placed`);
    }
  }
  return {
    ...base,
    board,
    hands: overrides.hands ?? hands,
    toMove: overrides.toMove ?? 'w',
    turn: overrides.turn ?? 5, // default: past the opening constraints
    ...(overrides.lastMoved !== undefined ? { lastMoved: overrides.lastMoved } : {}),
    passCount: overrides.passCount ?? 0,
  };
}

export const hex = (q: number, r: number): Hex => ({ q, r });

export function placesTo(moves: Move[], kind?: string): string[] {
  return moves
    .filter((m): m is Extract<Move, { type: 'place' }> => m.type === 'place')
    .filter((m) => kind === undefined || m.tile.kind === kind)
    .map((m) => `${m.to.q},${m.to.r}`);
}

export function placedKinds(moves: Move[]): Set<string> {
  return new Set(
    moves
      .filter((m): m is Extract<Move, { type: 'place' }> => m.type === 'place')
      .map((m) => m.tile.kind),
  );
}

export function tile(key: string): TileId {
  return parseTileKey(key);
}

export function movesOf(moves: Move[], tileKey: string): Array<Extract<Move, { type: 'move' }>> {
  return moves.filter(
    (m): m is Extract<Move, { type: 'move' }> =>
      m.type === 'move' && `${m.tile.color}${m.tile.kind}${m.tile.ordinal}` === tileKey,
  );
}

export function destinations(moves: Array<{ to: Hex }>): Set<string> {
  return new Set(moves.map((m) => `${m.to.q},${m.to.r}`));
}

export function colorOf(_c: Color): Color {
  return _c;
}
