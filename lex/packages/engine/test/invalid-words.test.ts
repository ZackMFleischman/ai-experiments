// The `invalidWords: 'costs-turn'` setting (DESIGN §2.2/§2.3): a play whose
// words aren't all in the dictionary is a PHONEY — it spends the turn instead
// of being rejected. Everything else about the pipeline is unchanged, which is
// what most of these assertions are really pinning: geometry still throws,
// legal plays still score, and the phoney's only footprints are
// toMove/moveCount and the scoreless run.
import { describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  RULESETS,
  applyMove,
  initialState,
  rejectedWords,
  type Move,
  type Placement,
} from '../src/index.js';
import { riggedBagOrder, stubDict } from './helpers.js';

const classic = RULESETS.classic!;
const costsTurn = { invalidWords: 'costs-turn' } as const;

function place(row: number, col: number, letter: string, isBlank = false): Placement {
  return { cell: { row, col }, letter, isBlank };
}

/** Seat 0: CATSEEE, seat 1: DOGRRRR, then bag continues Q Z J X … */
function startState() {
  const order = riggedBagOrder(
    classic,
    [
      ['C', 'A', 'T', 'S', 'E', 'E', 'E'],
      ['D', 'O', 'G', 'R', 'R', 'R', 'R'],
    ],
    ['Q', 'Z', 'J', 'X'],
  );
  return initialState(classic, order, 2);
}

const CAT: Move = { type: 'play', placements: [place(7, 7, 'C'), place(7, 8, 'A'), place(7, 9, 'T')] };
const TAC: Move = { type: 'play', placements: [place(7, 7, 'T'), place(7, 8, 'A'), place(7, 9, 'C')] };
/** Seat 1's own phoney (their rack is DOGRRRR), also a legal first play. */
const GOD: Move = { type: 'play', placements: [place(7, 7, 'G'), place(7, 8, 'O'), place(7, 9, 'D')] };

describe('rejectedWords', () => {
  it('names the words the dictionary refuses, in play order', () => {
    const words = [
      { word: 'CAT', score: 5, cells: [] },
      { word: 'TAC', score: 5, cells: [] },
      { word: 'ETAT', score: 4, cells: [] },
    ];
    expect(rejectedWords(words, stubDict(['TAC', 'ETAT']))).toEqual(['TAC', 'ETAT']);
    expect(rejectedWords(words, stubDict())).toEqual([]);
  });
});

describe("applyMove: invalidWords 'costs-turn'", () => {
  it('a phoney costs the turn: board, racks, bag and scores all stand still', () => {
    const state = startState();
    const next = applyMove(state, TAC, stubDict(['TAC']), costsTurn);

    expect(next.board.size).toBe(0);
    expect([...next.racks[0]!]).toEqual([...state.racks[0]!]);
    expect([...next.bag]).toEqual([...state.bag]);
    expect(next.scores).toEqual([0, 0]);
    expect(next.toMove).toBe(1);
    expect(next.moveCount).toBe(1);
    expect(next.scorelessRun).toBe(1);
  });

  it("rejects the same play under the 'blocked' default", () => {
    const state = startState();
    expect(() => applyMove(state, TAC, stubDict(['TAC']))).toThrow(IllegalMoveError);
    try {
      applyMove(state, TAC, stubDict(['TAC']));
    } catch (err) {
      expect((err as IllegalMoveError).reason).toBe('invalid-word');
      expect((err as IllegalMoveError).words).toEqual(['TAC']);
    }
  });

  it('leaves a good play alone: the setting changes nothing when the words are real', () => {
    const state = startState();
    const strict = applyMove(state, CAT, stubDict());
    const relaxed = applyMove(state, CAT, stubDict(), costsTurn);
    expect(relaxed.scores).toEqual(strict.scores);
    expect([...relaxed.racks[0]!]).toEqual([...strict.racks[0]!]);
    expect([...relaxed.board.keys()]).toEqual([...strict.board.keys()]);
    expect(relaxed.scorelessRun).toBe(0);
  });

  it('still throws on geometry and rack illegality — only the dictionary verdict changes', () => {
    const state = startState();
    const offBoard: Move = { type: 'play', placements: [place(7, 7, 'C'), place(7, 99, 'A')] };
    const notMine: Move = { type: 'play', placements: [place(7, 7, 'Z'), place(7, 8, 'Z')] };
    expect(() => applyMove(state, offBoard, stubDict(), costsTurn)).toThrow(IllegalMoveError);
    expect(() => applyMove(state, notMine, stubDict(), costsTurn)).toThrow(IllegalMoveError);
  });

  it('a cross-word phoney is a phoney: one bad word sinks the whole play', () => {
    const state = applyMove(startState(), CAT, stubDict());
    // Seat 1 hangs D off the C, forming DC downward as well as its main word.
    const play: Move = { type: 'play', placements: [place(6, 7, 'D')] };
    const before = state.scores[1];
    const next = applyMove(state, play, stubDict(['DC']), costsTurn);
    expect(next.board.has('6,7')).toBe(false);
    expect(next.scores[1]).toBe(before);
    expect(next.scorelessRun).toBe(1);
  });

  it('phoneys feed the scoreless run: scorelessLimit of them ends the game', () => {
    let state = startState();
    const bad = stubDict(['TAC', 'GOD']);
    for (let i = 0; i < classic.scorelessLimit; i++) {
      // Alternates seats, each playing a phoney off its own rack; the board
      // never changes, so both stay legal-but-phoney first plays throughout.
      state = applyMove(state, state.toMove === 0 ? TAC : GOD, bad, costsTurn);
    }
    expect(state.scorelessRun).toBe(classic.scorelessLimit);
    // The terminal move applied the §2.1 scoreless adjustment: each seat has
    // deducted its own rack.
    expect(state.scores[0]).toBeLessThan(0);
    expect(state.scores[1]).toBeLessThan(0);
    expect(() => applyMove(state, CAT, stubDict(), costsTurn)).toThrow(/game-over/);
  });

  it('replays deterministically — the same log yields the same state', () => {
    const bad = stubDict(['TAC']);
    // A phoney (seat 0) followed by a real play (seat 1) off the untouched board.
    const run = () => applyMove(applyMove(startState(), TAC, bad, costsTurn), GOD, bad, costsTurn);
    const once = run();
    const twice = run();
    expect([...once.board.keys()]).toEqual([...twice.board.keys()]);
    expect(once.scores).toEqual(twice.scores);
    expect(once.moveCount).toBe(2);
    // Seat 1's play landed on the board seat 0's phoney left empty.
    expect(once.board.get('7,7')).toEqual({ letter: 'G', isBlank: false });
    expect(once.scores[1]).toBeGreaterThan(0);
  });
});
