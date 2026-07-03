// State snapshot serializer (T4.4): the string stored on games/{id}.state
// (DESIGN §5.2) so functions validate without replaying and clients render
// instantly. Pure JSON, versioned; bigints travel as strings; board entries
// are sorted so identical states serialize identically.
import type { GameState, TileId } from './index';
import { parseTileKey, tileKey } from './state';

interface Serialized {
  v: 1;
  options: GameState['options'];
  board: Array<[string, string[]]>;
  hands: GameState['hands'];
  toMove: GameState['toMove'];
  turn: number;
  lastMoved?: { tile: string; byPillbug: boolean };
  passCount: number;
  positionHashes: string[];
}

export function serializeState(state: GameState): string {
  const data: Serialized = {
    v: 1,
    options: state.options,
    board: [...state.board.entries()]
      .map(([key, stack]) => [key, stack.map(tileKey)] as [string, string[]])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    hands: state.hands,
    toMove: state.toMove,
    turn: state.turn,
    ...(state.lastMoved
      ? { lastMoved: { tile: tileKey(state.lastMoved.tile), byPillbug: state.lastMoved.byPillbug } }
      : {}),
    passCount: state.passCount,
    positionHashes: state.positionHashes.map((h) => h.toString()),
  };
  return JSON.stringify(data);
}

export function deserializeState(text: string): GameState {
  const data = JSON.parse(text) as Serialized;
  if (data.v !== 1 || !data.options || !Array.isArray(data.board)) {
    throw new Error('unsupported state snapshot');
  }
  const board = new Map<string, readonly TileId[]>();
  for (const [key, stack] of data.board) board.set(key, stack.map(parseTileKey));
  return {
    options: data.options,
    board,
    hands: data.hands,
    toMove: data.toMove,
    turn: data.turn,
    ...(data.lastMoved
      ? {
          lastMoved: { tile: parseTileKey(data.lastMoved.tile), byPillbug: data.lastMoved.byPillbug },
        }
      : {}),
    passCount: data.passCount,
    positionHashes: data.positionHashes.map(BigInt),
  };
}
