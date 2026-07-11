// Game state and its (de)serialization. State is a plain JSON value — a
// 49-char board string plus bookkeeping — so it snapshots, diffs, and ships
// over the wire for free. applyTafl in apply.ts is the only thing that
// advances it; nothing here mutates. `seen` counts (board + side-to-move)
// position keys for threefold repetition; games are short, so it never needs
// pruning. The initial position is seeded into `seen` at 1 so returning to
// it twice is the third occurrence — the draw fires on the third sighting.

export type Side = 'attackers' | 'defenders';

export type Piece = 'A' | 'D' | 'K' | '.';

export interface TaflMove {
  from: number;
  to: number;
}

export type TaflResult =
  | { winner: Side; by: 'escape' | 'capture' | 'no-moves' | 'resign' | 'timeout' }
  | { winner: null; by: 'repetition' };

export interface TaflState {
  /** 49-char board string, row-major. */
  board: string;
  toMove: Side;
  moveCount: number;
  /** (board+toMove) position keys → times seen, for threefold repetition. */
  seen: Record<string, number>;
  result: TaflResult | null;
}

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

// Brandub setup: a cross of 8 attackers, 4 defenders around the king on the
// throne. Attackers move first.
const INITIAL_BOARD =
  '...A...' + // rank 1
  '...A...' + // rank 2
  '...D...' + // rank 3
  'AADKDAA' + // rank 4
  '...D...' + // rank 5
  '...A...' + // rank 6
  '...A...'; //  rank 7

/** Repetition key: the full position is the board plus whose turn it is. */
export function positionKey(board: string, toMove: Side): string {
  return `${board}|${toMove}`;
}

export function initialTafl(): TaflState {
  return {
    board: INITIAL_BOARD,
    toMove: 'attackers',
    moveCount: 0,
    seen: { [positionKey(INITIAL_BOARD, 'attackers')]: 1 },
    result: null,
  };
}

/** Which side a piece fights for — the king is a defender; '.' is nobody's. */
export function sideOf(piece: Piece): Side | null {
  if (piece === 'A') return 'attackers';
  if (piece === 'D' || piece === 'K') return 'defenders';
  return null;
}

export function otherSide(side: Side): Side {
  return side === 'attackers' ? 'defenders' : 'attackers';
}

export function pieceAt(state: TaflState, cell: number): Piece {
  const ch = state.board[cell];
  if (ch === undefined) throw new RangeError(`cell out of range: ${cell}`);
  return ch as Piece;
}

export function serializeTafl(state: TaflState): string {
  return JSON.stringify(state);
}

const WIN_BYS: readonly string[] = ['escape', 'capture', 'no-moves', 'resign', 'timeout'];

function parseResult(raw: unknown): TaflResult | null {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('deserializeTafl: result must be null or an object');
  }
  const o = raw as Record<string, unknown>;
  const winner = o['winner'];
  const by = o['by'];
  if (winner === null && by === 'repetition') return { winner: null, by: 'repetition' };
  if (
    (winner === 'attackers' || winner === 'defenders') &&
    typeof by === 'string' &&
    WIN_BYS.includes(by)
  ) {
    return { winner, by: by as 'escape' | 'capture' | 'no-moves' | 'resign' | 'timeout' };
  }
  throw new Error('deserializeTafl: corrupt result');
}

/** Parse + validate a serialized state; throws on anything malformed. */
export function deserializeTafl(text: string): TaflState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('deserializeTafl: not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('deserializeTafl: expected an object');
  }
  const o = raw as Record<string, unknown>;

  const board = o['board'];
  if (typeof board !== 'string' || board.length !== 49 || /[^ADK.]/.test(board)) {
    throw new Error('deserializeTafl: corrupt board');
  }
  const kings = board.split('').filter((ch) => ch === 'K').length;
  if (kings > 1) throw new Error('deserializeTafl: more than one king');

  const toMove = o['toMove'];
  if (toMove !== 'attackers' && toMove !== 'defenders') {
    throw new Error('deserializeTafl: corrupt toMove');
  }

  const moveCount = o['moveCount'];
  if (typeof moveCount !== 'number' || !Number.isInteger(moveCount) || moveCount < 0) {
    throw new Error('deserializeTafl: corrupt moveCount');
  }

  const seenRaw = o['seen'];
  if (typeof seenRaw !== 'object' || seenRaw === null || Array.isArray(seenRaw)) {
    throw new Error('deserializeTafl: corrupt seen');
  }
  const seen: Record<string, number> = {};
  for (const [key, count] of Object.entries(seenRaw)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new Error('deserializeTafl: corrupt seen count');
    }
    seen[key] = count;
  }

  return { board, toMove, moveCount, seen, result: parseResult(o['result']) };
}
