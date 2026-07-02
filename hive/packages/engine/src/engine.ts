// The engine's total API: legalMoves / applyMove / result (T1.8).
import { cellKey, neighbors, parseKey } from './hex';
import type { Color, GameResult, GameState, Hex, Move, TileId } from './index';
import { BUG_DESTINATIONS } from './bugs/index';
import { placements, canDepart } from './rules';
import { handCount, placeTile, removeTop, tileEquals, tileKey, topTile } from './state';

export class IllegalMoveError extends Error {
  override name = 'IllegalMoveError';
}

function moveKey(m: Move): string {
  switch (m.type) {
    case 'place':
      return `p|${tileKey(m.tile)}|${cellKey(m.to)}`;
    case 'move':
      return `m|${tileKey(m.tile)}|${cellKey(m.from)}|${cellKey(m.to)}`;
    case 'toss':
      return `t|${tileKey(m.by)}|${tileKey(m.tile)}|${cellKey(m.from)}|${cellKey(m.to)}`;
    case 'pass':
      return 'x';
  }
}

/** Exhaustive legal moves for the side to move. The UI renders ONLY this. */
export function legalMoves(state: GameState): Move[] {
  if (result(state).status !== 'ongoing') return [];

  const moves: Move[] = [...placements(state)];

  // No piece may move until that player's queen is placed.
  if (state.hands[state.toMove].Q === 0) {
    for (const key of state.board.keys()) {
      const from = parseKey(key);
      const tile = topTile(state.board, from);
      if (!tile || tile.color !== state.toMove) continue;
      if (!canDepart(state.board, from)) continue;
      const generate = BUG_DESTINATIONS[tile.kind];
      if (!generate) continue;
      for (const to of generate(state.board, from)) {
        moves.push({ type: 'move', tile, from, to });
      }
    }
  }

  if (moves.length === 0) moves.push({ type: 'pass' });
  return moves;
}

/** Applies a legal move; throws IllegalMoveError on anything else. */
export function applyMove(state: GameState, move: Move): GameState {
  const legal = new Set(legalMoves(state).map(moveKey));
  if (!legal.has(moveKey(move))) {
    throw new IllegalMoveError(`illegal ${move.type} for ${state.toMove} at turn ${state.turn}`);
  }

  let board = state.board;
  let hands = state.hands;
  let lastMoved: GameState['lastMoved'];
  let passCount = state.passCount;

  switch (move.type) {
    case 'place':
      board = placeTile(board, move.to, move.tile);
      hands = handCount(hands, move.tile.color, move.tile.kind, -1);
      lastMoved = { tile: move.tile, byPillbug: false };
      passCount = 0;
      break;
    case 'move':
      board = placeTile(removeTop(board, move.from), move.to, move.tile);
      lastMoved = { tile: move.tile, byPillbug: false };
      passCount = 0;
      break;
    case 'toss':
      board = placeTile(removeTop(board, move.from), move.to, move.tile);
      lastMoved = { tile: move.tile, byPillbug: true };
      passCount = 0;
      break;
    case 'pass':
      lastMoved = undefined;
      passCount += 1;
      break;
  }

  const next: GameState = {
    options: state.options,
    board,
    hands,
    toMove: state.toMove === 'w' ? 'b' : 'w',
    turn: state.toMove === 'b' ? state.turn + 1 : state.turn,
    passCount,
    positionHashes: state.positionHashes,
    ...(lastMoved ? { lastMoved } : {}), // a pass clears lastMoved entirely
  };
  return next;
}

function queenCell(state: GameState, color: Color): Hex | undefined {
  for (const [key, stack] of state.board) {
    if (stack.some((t: TileId) => t.kind === 'Q' && t.color === color)) return parseKey(key);
  }
  return undefined;
}

function isSurrounded(state: GameState, cell: Hex): boolean {
  return neighbors(cell).every((n) => state.board.has(cellKey(n)));
}

/** Board outcomes only — resignation etc. live outside the engine (DESIGN §2.3). */
export function result(state: GameState): GameResult {
  const wQueen = queenCell(state, 'w');
  const bQueen = queenCell(state, 'b');
  const wDead = wQueen !== undefined && isSurrounded(state, wQueen);
  const bDead = bQueen !== undefined && isSurrounded(state, bQueen);
  if (wDead && bDead) return { status: 'draw', by: 'surround' };
  if (wDead) return { status: 'won', winner: 'b', by: 'surround' };
  if (bDead) return { status: 'won', winner: 'w', by: 'surround' };
  return { status: 'ongoing' };
}

export { moveKey, tileEquals };
