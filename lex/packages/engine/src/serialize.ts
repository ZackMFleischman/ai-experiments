// Full + public state round-trips (DESIGN §5.1, §6.2). JSON with compact
// encodings: racks/bag as face strings, the board as a sorted "row,col" →
// letter record with lowercase = blank. serializeState is byte-deterministic
// (sorted keys) so identical states serialize identically.
import type { Board, PlacedTile } from './board.js';
import type { CellKey, TileFace } from './ruleset.js';
import { freezeState, type GameState, type PlayerView } from './state.js';

function boardToRecord(board: Board): Record<CellKey, string> {
  const record: Record<CellKey, string> = {};
  const keys = [...board.keys()].sort();
  for (const key of keys) {
    const tile = board.get(key)!;
    record[key] = tile.isBlank ? tile.letter.toLowerCase() : tile.letter;
  }
  return record;
}

function boardFromRecord(record: Record<CellKey, string>): Map<CellKey, PlacedTile> {
  const board = new Map<CellKey, PlacedTile>();
  for (const [key, char] of Object.entries(record)) {
    if (!/^\d+,\d+$/.test(key) || !/^[A-Za-z]$/.test(char)) throw new Error(`bad board entry: ${key}=${char}`);
    board.set(key, { letter: char.toUpperCase(), isBlank: char !== char.toUpperCase() });
  }
  return board;
}

function expectType(condition: boolean, what: string): asserts condition {
  if (!condition) throw new Error(`bad serialized state: ${what}`);
}

export function serializeState(state: GameState): string {
  return JSON.stringify({
    rulesetId: state.rulesetId,
    board: boardToRecord(state.board),
    racks: state.racks.map((rack) => rack.join('')),
    bag: state.bag.join(''),
    scores: state.scores,
    toMove: state.toMove,
    moveCount: state.moveCount,
    scorelessRun: state.scorelessRun,
  });
}

export function deserializeState(text: string): GameState {
  const raw: unknown = JSON.parse(text);
  expectType(typeof raw === 'object' && raw !== null, 'not an object');
  const data = raw as Record<string, unknown>;
  expectType(typeof data.rulesetId === 'string', 'rulesetId');
  expectType(typeof data.board === 'object' && data.board !== null, 'board');
  expectType(Array.isArray(data.racks) && data.racks.every((r) => typeof r === 'string'), 'racks');
  expectType(typeof data.bag === 'string', 'bag');
  expectType(Array.isArray(data.scores) && data.scores.every((s) => typeof s === 'number'), 'scores');
  expectType(typeof data.toMove === 'number', 'toMove');
  expectType(typeof data.moveCount === 'number', 'moveCount');
  expectType(typeof data.scorelessRun === 'number', 'scorelessRun');
  return freezeState({
    rulesetId: data.rulesetId,
    board: boardFromRecord(data.board as Record<CellKey, string>),
    racks: (data.racks as string[]).map((rack) => rack.split('') as TileFace[]),
    bag: (data.bag as string).split('') as TileFace[],
    scores: data.scores as number[],
    toMove: data.toMove,
    moveCount: data.moveCount,
    scorelessRun: data.scorelessRun,
  });
}

/** games/{id}.public (DESIGN §6.2): everything both players may see. */
export function serializePublic(state: GameState): string {
  return JSON.stringify({
    rulesetId: state.rulesetId,
    board: boardToRecord(state.board),
    scores: state.scores,
    bagCount: state.bag.length,
    rackCounts: state.racks.map((rack) => rack.length),
    toMove: state.toMove,
    moveCount: state.moveCount,
    scorelessRun: state.scorelessRun,
  });
}

export function parsePublic(text: string): Omit<PlayerView, 'rack'> {
  const raw: unknown = JSON.parse(text);
  expectType(typeof raw === 'object' && raw !== null, 'not an object');
  const data = raw as Record<string, unknown>;
  expectType(typeof data.rulesetId === 'string', 'rulesetId');
  expectType(typeof data.board === 'object' && data.board !== null, 'board');
  expectType(Array.isArray(data.scores), 'scores');
  expectType(typeof data.bagCount === 'number', 'bagCount');
  expectType(Array.isArray(data.rackCounts), 'rackCounts');
  expectType(typeof data.toMove === 'number', 'toMove');
  expectType(typeof data.moveCount === 'number', 'moveCount');
  expectType(typeof data.scorelessRun === 'number', 'scorelessRun');
  return {
    rulesetId: data.rulesetId,
    board: boardFromRecord(data.board as Record<CellKey, string>),
    scores: data.scores as number[],
    bagCount: data.bagCount,
    rackCounts: data.rackCounts as number[],
    toMove: data.toMove,
    moveCount: data.moveCount,
    scorelessRun: data.scorelessRun,
  };
}
