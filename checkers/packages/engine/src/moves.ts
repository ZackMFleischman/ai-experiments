// Move generation. Men step one dark square diagonally forward (dark heads
// +row, light -row); kings step either way. Captures jump an adjacent enemy
// onto the empty square beyond and are MANDATORY: if the side to move has any
// jump, only jump moves are legal. A jump sequence must continue while the
// same piece has another jump from its landing square (the player picks
// freely among branches — no maximal-capture rule), and crowning ends the
// sequence. legalMovesFrom therefore returns complete paths, each one whole
// move: path[0] the origin, then every landing square.

import { CELL_COUNT, rowOf, step } from './board.js';
import { otherSide, sideOf, type Piece, type Side, type CheckersMove, type CheckersState } from './state.js';

const ALL_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const DARK_DIRS = ALL_DIRS.filter(([dr]) => dr === 1);
const LIGHT_DIRS = ALL_DIRS.filter(([dr]) => dr === -1);

/** Step/jump directions for a piece: men forward only, kings everywhere. */
function dirsOf(piece: Piece): readonly (readonly [number, number])[] {
  if (piece === 'D' || piece === 'L') return ALL_DIRS;
  return piece === 'd' ? DARK_DIRS : LIGHT_DIRS;
}

/** The crowning row a man of `side` is heading for. */
export function crownRow(side: Side): number {
  return side === 'dark' ? 7 : 0;
}

/** Single jumps available to `piece` standing on `cell` of a working board. */
function jumps(board: string[], cell: number, piece: Piece): Array<{ over: number; to: number }> {
  const enemy = otherSide(sideOf(piece) as Side);
  const out: Array<{ over: number; to: number }> = [];
  for (const dir of dirsOf(piece)) {
    const over = step(cell, dir);
    if (over === -1 || sideOf((board[over] ?? '.') as Piece) !== enemy) continue;
    const to = step(over, dir);
    if (to !== -1 && board[to] === '.') out.push({ over, to });
  }
  return out;
}

/** DFS all complete jump sequences for `piece` from `cell`. Captured pieces
 * leave the working board immediately (they can't be jumped twice); a man
 * that lands on the crown row stops there — crowning ends the sequence. */
function capturePaths(board: string[], cell: number, piece: Piece, prefix: number[]): number[][] {
  const options = jumps(board, cell, piece);
  const man = piece === 'd' || piece === 'l';
  if (options.length === 0) return prefix.length > 1 ? [prefix] : [];
  const out: number[][] = [];
  for (const { over, to } of options) {
    const next = [...board];
    next[cell] = '.';
    next[over] = '.';
    next[to] = piece;
    if (man && rowOf(to) === crownRow(sideOf(piece) as Side)) {
      out.push([...prefix, to]); // crowned — the jump sequence ends here
    } else {
      out.push(...capturePaths(next, to, piece, [...prefix, to]));
    }
  }
  return out;
}

/** Does the side to move have any capture anywhere? (Mandatory-capture gate.) */
function sideHasCapture(state: CheckersState): boolean {
  const cells = state.board.split('');
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const piece = cells[cell] as Piece;
    if (sideOf(piece) === state.toMove && jumps(cells, cell, piece).length > 0) return true;
  }
  return false;
}

/** Moves for one piece given the (precomputed) mandatory-capture verdict. */
function movesFor(cells: string[], from: number, piece: Piece, mustCapture: boolean): CheckersMove[] {
  if (mustCapture) {
    return capturePaths(cells, from, piece, [from]).map((path) => ({ path }));
  }
  const out: CheckersMove[] = [];
  for (const dir of dirsOf(piece)) {
    const to = step(from, dir);
    if (to !== -1 && cells[to] === '.') out.push({ path: [from, to] });
  }
  return out;
}

/**
 * All complete legal moves for the piece on `from`. Empty when the game is
 * over, `from` is out of range or empty, the piece isn't the mover's, or a
 * capture exists elsewhere and this piece has none.
 */
export function legalMovesFrom(state: CheckersState, from: number): CheckersMove[] {
  if (state.result !== null) return [];
  if (!Number.isInteger(from) || from < 0 || from >= CELL_COUNT) return [];
  const piece = state.board.charAt(from) as Piece;
  if (sideOf(piece) !== state.toMove) return [];
  return movesFor(state.board.split(''), from, piece, sideHasCapture(state));
}

/** Every legal move for the side to move; empty once the game is over. */
export function allLegalMoves(state: CheckersState): CheckersMove[] {
  if (state.result !== null) return [];
  const cells = state.board.split('');
  const mustCapture = sideHasCapture(state); // once, not per cell
  const moves: CheckersMove[] = [];
  for (let from = 0; from < CELL_COUNT; from++) {
    const piece = cells[from] as Piece;
    if (sideOf(piece) !== state.toMove) continue;
    moves.push(...movesFor(cells, from, piece, mustCapture));
  }
  return moves;
}
