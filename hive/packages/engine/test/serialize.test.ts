// T4.4: state snapshot serializer — the games/{id}.state field (DESIGN §5.2).
// Round-trips must be exact: same hash, same legal moves, same repetition
// history, and deterministic output (identical states ⇒ identical strings).
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  deserializeState,
  hash,
  initialState,
  legalMoves,
  parseUhp,
  serializeState,
  type GameOptions,
  type GameState,
} from '../src/index';

const ALL_ON: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

function replay(moves: string[], options: GameOptions = ALL_ON): GameState {
  let s = initialState(options);
  for (const uhp of moves) s = applyMove(s, parseUhp(uhp, s));
  return s;
}

// Mid-game with a beetle stack and a real lastMoved.
const MID: string[] = ['wS1', 'bS1 wS1-', 'wQ -wS1', 'bQ bS1-', 'wB1 \\wQ', 'bA1 bQ-', 'wB1 wQ'];

describe('serializeState / deserializeState', () => {
  it('round-trips the initial state', () => {
    const s = initialState(ALL_ON);
    const back = deserializeState(serializeState(s));
    expect(back).toEqual(s);
    expect(hash(back)).toBe(hash(s));
  });

  it('round-trips a mid-game state exactly (board, hands, lastMoved, hashes)', () => {
    const s = replay(MID);
    const back = deserializeState(serializeState(s));
    expect(back.toMove).toBe(s.toMove);
    expect(back.turn).toBe(s.turn);
    expect(back.lastMoved).toEqual(s.lastMoved);
    expect(back.passCount).toBe(s.passCount);
    expect(back.positionHashes).toEqual(s.positionHashes);
    const sortEntries = (m: GameState['board']) =>
      [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
    expect(sortEntries(back.board)).toEqual(sortEntries(s.board));
    expect(back.hands).toEqual(s.hands);
    expect(hash(back)).toBe(hash(s));
  });

  it('a deserialized state generates the same legal moves and keeps playing', () => {
    const s = replay(MID);
    const back = deserializeState(serializeState(s));
    const a = legalMoves(s).map((m) => JSON.stringify(m)).sort();
    const b = legalMoves(back).map((m) => JSON.stringify(m)).sort();
    expect(b).toEqual(a);
    // applying a move to the round-tripped state must not throw
    const move = legalMoves(back)[0]!;
    expect(() => applyMove(back, move)).not.toThrow();
  });

  it('is deterministic: same state, same string', () => {
    const a = serializeState(replay(MID));
    const b = serializeState(replay(MID));
    expect(a).toBe(b);
  });

  it('rejects garbage', () => {
    expect(() => deserializeState('{}')).toThrow();
    expect(() => deserializeState('not json')).toThrow();
  });
});
