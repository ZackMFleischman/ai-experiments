// T7.1: withdrawal — a seat leaves, its rack goes back to the bag END, the
// turn skips it, and `withdrawn` survives every round-trip (DESIGN §2.1,
// §2.4, §5.1; DECISIONS 2026-08-28 "Resign/timeout at 3+ is a WITHDRAWAL").
import { describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  RULESETS,
  applyMove,
  deserializeState,
  initialState,
  parsePublic,
  playerView,
  result,
  serializePublic,
  serializeState,
  withdraw,
  type CellKey,
  type GameState,
  type PlacedTile,
  type TileFace,
} from '../src/index.js';
import { canonicalBagOrder, riggedBagOrder, stubDict } from './helpers.js';

const classic = RULESETS.classic!;
const dict = stubDict();

/** Every tile face in play, so conservation can be asserted per face. */
function census(state: GameState): Record<string, number> {
  const all: TileFace[] = [
    ...[...state.board.values()].map((tile) => (tile.isBlank ? '?' : tile.letter)),
    ...state.racks.flat(),
    ...state.bag,
  ];
  const out: Record<string, number> = {};
  for (const face of all) out[face] = (out[face] ?? 0) + 1;
  return out;
}

function threeSeats(): GameState {
  return initialState(classic, canonicalBagOrder(classic), 3);
}

describe('withdraw', () => {
  it('empties the rack, appends it to the bag END, and records the seat', () => {
    const state = threeSeats();
    const rack = state.racks[1]!;
    const bagBefore = state.bag;

    const after = withdraw(state, 1);

    expect(after.racks[1]).toEqual([]);
    expect(after.withdrawn).toEqual([1]);
    // Appended, not shuffled — re-randomizing is the server's job (§3.3),
    // exactly as after an exchange.
    expect(after.bag).toEqual([...bagBefore, ...rack]);
    expect(after.bag.slice(0, bagBefore.length)).toEqual(bagBefore);
  });

  it('freezes the withdrawn seat’s score and leaves the others alone', () => {
    const state = { ...threeSeats(), scores: [40, 250, 10] };
    const after = withdraw(state, 1);
    expect([...after.scores]).toEqual([40, 250, 10]);
  });

  it('conserves tiles at three and four seats', () => {
    for (const seats of [3, 4]) {
      const state = initialState(classic, canonicalBagOrder(classic), seats);
      expect(census(state)).toEqual(classic.tiles.counts);
      expect(census(withdraw(state, 1))).toEqual(classic.tiles.counts);
    }
  });

  it('advances moveCount so the log and the concurrency cursor stay in step', () => {
    const state = threeSeats();
    expect(withdraw(state, 1).moveCount).toBe(state.moveCount + 1);
  });

  it('passes the turn on when the seat to move withdraws', () => {
    const state = threeSeats();
    expect(state.toMove).toBe(0);
    expect(withdraw(state, 0).toMove).toBe(1);
  });

  it('wraps to the first active seat when the last seat withdraws on its turn', () => {
    const state = { ...threeSeats(), toMove: 2 };
    expect(withdraw(state, 2).toMove).toBe(0);
  });

  it('leaves the turn alone when a seat that is not to move withdraws', () => {
    const state = threeSeats();
    expect(withdraw(state, 2).toMove).toBe(0);
  });

  it('rejects an out-of-range seat and a repeat withdrawal', () => {
    const state = threeSeats();
    expect(() => withdraw(state, 3)).toThrow(IllegalMoveError);
    expect(() => withdraw(state, -1)).toThrow(IllegalMoveError);
    expect(() => withdraw(withdraw(state, 1), 1)).toThrow(/already withdrawn/);
  });
});

describe('turn advance skips withdrawn seats', () => {
  // Racks rigged so seat 0 can open through the centre; the rest is irrelevant.
  function opened(): GameState {
    const racks: TileFace[][] = [
      ['C', 'A', 'T', 'S', 'E', 'R', 'D'],
      ['D', 'O', 'G', 'N', 'R', 'I', 'N'],
      ['M', 'O', 'U', 'S', 'E', 'L', 'P'],
    ];
    return initialState(classic, riggedBagOrder(classic, racks), 3);
  }

  it('hands 0 → 2 when seat 1 has withdrawn', () => {
    const state = withdraw(opened(), 1);
    expect(state.toMove).toBe(0);
    const after = applyMove(state, { type: 'pass' }, dict);
    expect(after.toMove).toBe(2);
    expect(applyMove(after, { type: 'pass' }, dict).toMove).toBe(0);
  });

  it('never lands on a withdrawn seat over a long run of passes', () => {
    let state: GameState = withdraw(opened(), 2);
    for (let i = 0; i < 12 && result(state).status === 'ongoing'; i++) {
      expect(state.withdrawn).not.toContain(state.toMove);
      state = applyMove(state, { type: 'pass' }, dict);
    }
    expect(state.withdrawn).not.toContain(state.toMove);
  });
});

describe('a withdrawal does not end the game', () => {
  // Bag empty, three seats — the played-out test must look at ACTIVE racks
  // only, or emptying a withdrawing seat's rack would end the game instantly.
  function emptyBagState(): GameState {
    const board = new Map<CellKey, PlacedTile>([
      ['7,6', { letter: 'C', isBlank: false }],
      ['7,7', { letter: 'A', isBlank: false }],
      ['7,8', { letter: 'T', isBlank: false }],
    ]);
    return {
      rulesetId: 'classic',
      board,
      racks: [['S', 'E'], ['Q', 'X'], ['L', 'N']] as TileFace[][],
      bag: [],
      scores: [50, 60, 55],
      toMove: 0,
      moveCount: 10,
      scorelessRun: 0,
      withdrawn: [],
    };
  }

  it('stays ongoing when a seat withdraws with the bag empty', () => {
    const state = emptyBagState();
    expect(result(state).status).toBe('ongoing');
    const after = withdraw(state, 1);
    expect(after.racks[1]).toEqual([]);
    expect(result(after).status).toBe('ongoing');
  });

  it('still ends played-out when an ACTIVE seat empties its rack', () => {
    // Seat 1 withdrew (bag now holds its two tiles); seat 2 later plays out.
    const state = { ...withdraw(emptyBagState(), 1), bag: [], racks: [[], ['S', 'E'], []] as TileFace[][] };
    expect(result(state)).toMatchObject({ status: 'finished', by: 'played-out' });
  });

  it('refuses a withdrawal from a finished game', () => {
    const finished = { ...emptyBagState(), racks: [[], ['Q', 'X'], ['L', 'N']] as TileFace[][] };
    expect(() => withdraw(finished, 1)).toThrow(/game-over/);
  });
});

describe('withdrawn round-trips', () => {
  it('survives serializeState → deserializeState', () => {
    const state = withdraw(withdraw(threeSeats(), 2), 0);
    expect(state.withdrawn).toEqual([0, 2]);
    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  it('is public: serializePublic → parsePublic, and playerView carries it', () => {
    const state = withdraw(threeSeats(), 1);
    const { rack: _rack, ...view } = playerView(state, 0);
    expect(view.withdrawn).toEqual([1]);
    expect(parsePublic(serializePublic(state))).toEqual(view);
  });

  it('defaults to [] when a pre-M7 document omits it', () => {
    const state = threeSeats();
    const full = JSON.parse(serializeState(state)) as Record<string, unknown>;
    delete full.withdrawn;
    expect(deserializeState(JSON.stringify(full)).withdrawn).toEqual([]);

    const pub = JSON.parse(serializePublic(state)) as Record<string, unknown>;
    delete pub.withdrawn;
    expect(parsePublic(JSON.stringify(pub)).withdrawn).toEqual([]);
  });

  it('rejects a malformed withdrawn field', () => {
    const state = threeSeats();
    const full = JSON.parse(serializeState(state)) as Record<string, unknown>;
    full.withdrawn = ['nope'];
    expect(() => deserializeState(JSON.stringify(full))).toThrow(/withdrawn/);
  });
});
