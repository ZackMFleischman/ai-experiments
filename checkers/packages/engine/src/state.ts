// Game state and its (de)serialization. State is a plain JSON value — a
// 64-char board string plus bookkeeping — so it snapshots, diffs, and ships
// over the wire for free. applyCheckers in apply.ts is the only thing that
// advances it; nothing here mutates. `seen` counts (board + side-to-move)
// position keys for threefold repetition; games are short, so it never needs
// pruning. The initial position is seeded into `seen` at 1 so returning to
// it twice is the third occurrence — the draw fires on the third sighting.

export type Side = 'dark' | 'light';

/** 'd'/'l' men, 'D'/'L' kings, '.' empty. Pieces live on dark squares only. */
export type Piece = 'd' | 'D' | 'l' | 'L' | '.';

/** A whole move as its square sequence: path[0] is the origin, then each
 * landing. Simple moves have exactly 2 entries; multi-jumps one per hop. */
export interface CheckersMove {
  path: number[];
}

export type CheckersResult =
  | { winner: Side; by: 'no-moves' | 'resign' | 'timeout' }
  | { winner: null; by: 'repetition' };

export interface CheckersState {
  /** 64-char board string, row-major. */
  board: string;
  toMove: Side;
  moveCount: number;
  /** (board+toMove) position keys → times seen, for threefold repetition. */
  seen: Record<string, number>;
  result: CheckersResult | null;
}

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

// American checkers setup: 12 dark men on the dark squares of rows 0-2 (top),
// 12 light men on rows 5-7. Dark moves first, heading down the board.
const INITIAL_BOARD =
  '.d.d.d.d' + // rank 1
  'd.d.d.d.' + // rank 2
  '.d.d.d.d' + // rank 3
  '........' + // rank 4
  '........' + // rank 5
  'l.l.l.l.' + // rank 6
  '.l.l.l.l' + // rank 7
  'l.l.l.l.'; //  rank 8

/** Repetition key: the full position is the board plus whose turn it is. */
export function positionKey(board: string, toMove: Side): string {
  return `${board}|${toMove}`;
}

export function initialCheckers(): CheckersState {
  return {
    board: INITIAL_BOARD,
    toMove: 'dark',
    moveCount: 0,
    seen: { [positionKey(INITIAL_BOARD, 'dark')]: 1 },
    result: null,
  };
}

/** Which side a piece fights for — '.' is nobody's. */
export function sideOf(piece: Piece): Side | null {
  if (piece === 'd' || piece === 'D') return 'dark';
  if (piece === 'l' || piece === 'L') return 'light';
  return null;
}

export function otherSide(side: Side): Side {
  return side === 'dark' ? 'light' : 'dark';
}

export function pieceAt(state: CheckersState, cell: number): Piece {
  const ch = state.board[cell];
  if (ch === undefined) throw new RangeError(`cell out of range: ${cell}`);
  return ch as Piece;
}

export function serializeCheckers(state: CheckersState): string {
  return JSON.stringify(state);
}

const WIN_BYS: readonly string[] = ['no-moves', 'resign', 'timeout'];

function parseResult(raw: unknown): CheckersResult | null {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('deserializeCheckers: result must be null or an object');
  }
  const o = raw as Record<string, unknown>;
  const winner = o['winner'];
  const by = o['by'];
  if (winner === null && by === 'repetition') return { winner: null, by: 'repetition' };
  if ((winner === 'dark' || winner === 'light') && typeof by === 'string' && WIN_BYS.includes(by)) {
    return { winner, by: by as 'no-moves' | 'resign' | 'timeout' };
  }
  throw new Error('deserializeCheckers: corrupt result');
}

/** Parse + validate a serialized state; throws on anything malformed. */
export function deserializeCheckers(text: string): CheckersState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('deserializeCheckers: not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('deserializeCheckers: expected an object');
  }
  const o = raw as Record<string, unknown>;

  const board = o['board'];
  if (typeof board !== 'string' || board.length !== 64 || /[^dDlL.]/.test(board)) {
    throw new Error('deserializeCheckers: corrupt board');
  }
  for (let cell = 0; cell < 64; cell++) {
    const light = (Math.floor(cell / 8) + (cell % 8)) % 2 === 0;
    if (light && board.charAt(cell) !== '.') {
      throw new Error('deserializeCheckers: piece on a light square');
    }
  }

  const toMove = o['toMove'];
  if (toMove !== 'dark' && toMove !== 'light') {
    throw new Error('deserializeCheckers: corrupt toMove');
  }

  const moveCount = o['moveCount'];
  if (typeof moveCount !== 'number' || !Number.isInteger(moveCount) || moveCount < 0) {
    throw new Error('deserializeCheckers: corrupt moveCount');
  }

  const seenRaw = o['seen'];
  if (typeof seenRaw !== 'object' || seenRaw === null || Array.isArray(seenRaw)) {
    throw new Error('deserializeCheckers: corrupt seen');
  }
  const seen: Record<string, number> = {};
  for (const [key, count] of Object.entries(seenRaw)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new Error('deserializeCheckers: corrupt seen count');
    }
    seen[key] = count;
  }

  return { board, toMove, moveCount, seen, result: parseResult(o['result']) };
}
