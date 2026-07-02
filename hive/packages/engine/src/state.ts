// GameState construction and immutable board/hand helpers (T1.2).
import { cellKey } from './hex';
import type { BugKind, CellKey, Color, GameOptions, GameState, Hex, TileId } from './index';

export const BUG_KINDS: readonly BugKind[] = ['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P'];

export type Board = ReadonlyMap<CellKey, readonly TileId[]>;
export type Hands = GameState['hands'];

function initialHand(options: GameOptions): Record<BugKind, number> {
  return {
    Q: 1,
    A: 3,
    S: 2,
    G: 3,
    B: 2,
    M: options.mosquito ? 1 : 0,
    L: options.ladybug ? 1 : 0,
    P: options.pillbug ? 1 : 0,
  };
}

export function initialState(options: GameOptions): GameState {
  return {
    options,
    board: new Map(),
    hands: { w: initialHand(options), b: initialHand(options) },
    toMove: 'w',
    turn: 1,
    passCount: 0,
    positionHashes: [],
  };
}

export function stackAt(board: Board, h: Hex): readonly TileId[] {
  return board.get(cellKey(h)) ?? [];
}

export function topTile(board: Board, h: Hex): TileId | undefined {
  const stack = board.get(cellKey(h));
  return stack?.[stack.length - 1];
}

export function isOccupied(board: Board, h: Hex): boolean {
  return board.has(cellKey(h));
}

export function heightAt(board: Board, h: Hex): number {
  return board.get(cellKey(h))?.length ?? 0;
}

export function placeTile(board: Board, h: Hex, tile: TileId): Board {
  const key = cellKey(h);
  const next = new Map(board);
  next.set(key, [...(board.get(key) ?? []), tile]);
  return next;
}

export function removeTop(board: Board, h: Hex): Board {
  const key = cellKey(h);
  const stack = board.get(key);
  if (!stack || stack.length === 0) throw new Error(`removeTop on empty cell ${key}`);
  const next = new Map(board);
  if (stack.length === 1) next.delete(key);
  else next.set(key, stack.slice(0, -1));
  return next;
}

export function tileKey(t: TileId): string {
  return `${t.color}${t.kind}${t.ordinal}`;
}

export function parseTileKey(key: string): TileId {
  return {
    color: key[0] as Color,
    kind: key[1] as BugKind,
    ordinal: Number(key[2]) as TileId['ordinal'],
  };
}

export function tileEquals(a: TileId, b: TileId): boolean {
  return a.color === b.color && a.kind === b.kind && a.ordinal === b.ordinal;
}

export function handCount(hands: Hands, color: Color, kind: BugKind, delta: number): Hands {
  return {
    ...hands,
    [color]: { ...hands[color], [kind]: hands[color][kind] + delta },
  } as Hands;
}
