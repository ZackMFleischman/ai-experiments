// UHP (Universal Hive Protocol) notation (T1.9, DESIGN §2.4).
// `wS1 bQ-` = white spider 1 to the EAST of the black queen; `-ref` W, `\ref` NW,
// `/ref` SW, `ref-` E, `ref/` NE, `ref\` SE; bare ref = climb on top; `pass`.
// Toss/self-move ambiguity canonicalizes to SELF-MOVE.
import { add, cellKey, DIRECTIONS, hexEquals, sub } from './hex';
import { legalMoves } from './engine';
import type { BugKind, Color, GameState, Hex, Move, TileId } from './index';
import { type Board, removeTop, tileEquals, topTile } from './state';

const NUMBERED = new Set<BugKind>(['A', 'S', 'G', 'B']);

export function tileName(t: TileId): string {
  return `${t.color}${t.kind}${NUMBERED.has(t.kind) ? t.ordinal : ''}`;
}

export function parseTileName(name: string): TileId {
  const match = /^([wb])([QASGBMLP])([123])?$/.exec(name);
  if (!match) throw new Error(`bad UHP piece name: ${name}`);
  const kind = match[2] as BugKind;
  if (NUMBERED.has(kind) !== (match[3] !== undefined)) {
    throw new Error(`bad UHP piece name: ${name}`);
  }
  return {
    color: match[1] as Color,
    kind,
    ordinal: (match[3] ? Number(match[3]) : 1) as TileId['ordinal'],
  };
}

// DIRECTIONS order is [E, W, NE, NW, SE, SW].
function markerFor(dirIndex: number, ref: string): string {
  switch (dirIndex) {
    case 0:
      return `${ref}-`;
    case 1:
      return `-${ref}`;
    case 2:
      return `${ref}/`;
    case 3:
      return `\\${ref}`;
    case 4:
      return `${ref}\\`;
    case 5:
      return `/${ref}`;
    default:
      throw new Error(`bad direction index ${dirIndex}`);
  }
}

function dirIndexOf(d: Hex): number {
  const i = DIRECTIONS.findIndex((dir) => hexEquals(dir, d));
  if (i < 0) throw new Error(`not a unit direction: ${d.q},${d.r}`);
  return i;
}

/** Board with the moving tile lifted (no-op for placements). */
function boardForReference(move: Move, board: Board): Board {
  if (move.type === 'move' || move.type === 'toss') return removeTop(board, move.from);
  return board;
}

export function toUhp(move: Move, state: GameState): string {
  if (move.type === 'pass') return 'pass';
  const name = tileName(move.tile);
  const board = boardForReference(move, state.board);
  if (board.size === 0) return name; // very first move

  const destTop = topTile(board, move.to);
  if (destTop) return `${name} ${tileName(destTop)}`; // climb

  // Reference a neighboring stack top, first hit in fixed DIRECTIONS order.
  for (let i = 0; i < DIRECTIONS.length; i++) {
    const refCell = add(move.to, DIRECTIONS[i] as Hex);
    const ref = topTile(board, refCell);
    if (!ref) continue;
    const dirIndex = dirIndexOf(sub(move.to, refCell));
    return `${name} ${markerFor(dirIndex, tileName(ref))}`;
  }
  throw new Error(`no reference tile adjacent to ${cellKey(move.to)}`);
}

function findTopCell(board: Board, tile: TileId): Hex | undefined {
  for (const key of board.keys()) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    const top = topTile(board, { q, r });
    if (top && tileEquals(top, tile)) return { q, r };
  }
  return undefined;
}

export function parseUhp(uhp: string, state: GameState): Move {
  const text = uhp.trim();
  if (text === 'pass') return { type: 'pass' };

  const [pieceStr, targetStr, extra] = text.split(/\s+/);
  if (!pieceStr || extra) throw new Error(`bad UHP move: ${uhp}`);
  const tile = parseTileName(pieceStr);

  const onBoard = findTopCell(state.board, tile);
  const refBoard = onBoard ? removeTop(state.board, onBoard) : state.board;

  let to: Hex;
  if (!targetStr) {
    if (refBoard.size > 0) throw new Error(`missing target in: ${uhp}`);
    to = { q: 0, r: 0 };
  } else {
    let refName = targetStr;
    let dirIndex = -1; // -1 = climb on top of ref
    if (targetStr.startsWith('-')) {
      dirIndex = 1; // W
      refName = targetStr.slice(1);
    } else if (targetStr.startsWith('\\')) {
      dirIndex = 3; // NW
      refName = targetStr.slice(1);
    } else if (targetStr.startsWith('/')) {
      dirIndex = 5; // SW
      refName = targetStr.slice(1);
    } else if (targetStr.endsWith('-')) {
      dirIndex = 0; // E
      refName = targetStr.slice(0, -1);
    } else if (targetStr.endsWith('/')) {
      dirIndex = 2; // NE
      refName = targetStr.slice(0, -1);
    } else if (targetStr.endsWith('\\')) {
      dirIndex = 4; // SE
      refName = targetStr.slice(0, -1);
    }
    const ref = parseTileName(refName);
    const refCell = findTopCell(refBoard, ref);
    if (!refCell) throw new Error(`reference tile ${refName} not visible on board: ${uhp}`);
    to = dirIndex === -1 ? refCell : add(refCell, DIRECTIONS[dirIndex] as Hex);
  }

  if (!onBoard) {
    // Not visible on top of any stack: it's a placement — unless it's buried.
    for (const stack of state.board.values()) {
      if (stack.some((t) => tileEquals(t, tile))) {
        throw new Error(`${pieceStr} is buried and cannot move: ${uhp}`);
      }
    }
    return { type: 'place', tile, to };
  }

  // Self-move vs pillbug toss: UHP cannot tell them apart; ambiguity
  // canonicalizes to self-move (DESIGN §2.4).
  const candidates = legalMoves(state).filter(
    (m) =>
      (m.type === 'move' || m.type === 'toss') && tileEquals(m.tile, tile) && hexEquals(m.to, to),
  );
  const selfMove = candidates.find((m) => m.type === 'move');
  const move = selfMove ?? candidates[0];
  if (!move) throw new Error(`no legal interpretation of: ${uhp}`);
  return move;
}
