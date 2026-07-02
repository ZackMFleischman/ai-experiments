import { describe, expect, it } from 'vitest';
import { applyMove, IllegalMoveError, initialState, legalMoves, result } from '../src/index';
import type { Move } from '../src/index';
import { ALL_ON, BASE, buildState, movesOf, tile } from './helpers';

const EMPTY_HANDS = {
  w: { Q: 0, A: 0, S: 0, G: 0, B: 0, M: 0, L: 0, P: 0 },
  b: { Q: 0, A: 0, S: 0, G: 0, B: 0, M: 0, L: 0, P: 0 },
};

describe('legalMoves (T1.8)', () => {
  it('opening: white places at the origin; black answers adjacent', () => {
    let s = initialState(ALL_ON);
    const white = legalMoves(s);
    expect(white.every((m) => m.type === 'place')).toBe(true);
    s = applyMove(s, white[0] as Move);
    expect(s.toMove).toBe('b');
    expect(s.turn).toBe(1);
    const black = legalMoves(s);
    expect(black.every((m) => m.type === 'place')).toBe(true);
    expect(black.some((m) => m.type === 'place' && m.tile.color === 'b')).toBe(true);
  });

  it('no piece moves until that player queen is placed', () => {
    // White queen still in hand: white gets placements only.
    const s = buildState([[0, 0, 'wS1'], [1, 0, 'bQ1']], { turn: 2, toMove: 'w' });
    expect(legalMoves(s).every((m) => m.type === 'place')).toBe(true);
    // Once the white queen is down, moves appear.
    const s2 = buildState([[0, 0, 'wS1'], [-1, 0, 'wQ1'], [1, 0, 'bQ1']], { turn: 3, toMove: 'w' });
    expect(legalMoves(s2).some((m) => m.type === 'move')).toBe(true);
  });

  it('one-hive: a cut-vertex tile gets no moves', () => {
    const s = buildState([[-1, 0, 'wQ1'], [0, 0, 'wS1'], [1, 0, 'bQ1']], { toMove: 'w' });
    expect(movesOf(legalMoves(s), 'wS1')).toEqual([]);
    expect(movesOf(legalMoves(s), 'wQ1').length).toBeGreaterThan(0);
  });

  it('buried pieces never move; the stack top does', () => {
    const s = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1', 'wB1'], [2, 0, 'bS1']], { toMove: 'w' });
    const moves = legalMoves(s);
    expect(movesOf(moves, 'bQ1')).toEqual([]); // buried (and enemy)
    expect(movesOf(moves, 'wB1').length).toBeGreaterThan(0);
  });

  it('pass is offered exactly when nothing else is legal', () => {
    // White: lone queen pinned as a cut vertex, empty hand → forced pass.
    const s = buildState([[-1, 0, 'bS1'], [0, 0, 'wQ1'], [1, 0, 'bQ1']], {
      toMove: 'w',
      hands: EMPTY_HANDS,
    });
    expect(legalMoves(s)).toEqual([{ type: 'pass' }]);
  });
});

describe('applyMove (T1.8)', () => {
  it('rejects illegal moves with IllegalMoveError', () => {
    const s = initialState(BASE);
    expect(() => applyMove(s, { type: 'place', tile: tile('wQ1'), to: { q: 5, r: 5 } })).toThrow(
      IllegalMoveError,
    );
    expect(() => applyMove(s, { type: 'pass' })).toThrow(IllegalMoveError);
  });

  it('applies placements: board grows, hand shrinks, turn alternates', () => {
    let s = initialState(BASE);
    s = applyMove(s, { type: 'place', tile: tile('wS1'), to: { q: 0, r: 0 } });
    expect(s.board.get('0,0')).toEqual([tile('wS1')]);
    expect(s.hands.w.S).toBe(1);
    expect(s.toMove).toBe('b');
    expect(s.turn).toBe(1);
    s = applyMove(s, { type: 'place', tile: tile('bS1'), to: { q: 1, r: 0 } });
    expect(s.turn).toBe(2); // black completed the full turn
    expect(s.toMove).toBe('w');
    expect(s.lastMoved).toEqual({ tile: tile('bS1'), byPillbug: false });
  });

  it('applies moves: tile relocates, lastMoved records it', () => {
    const s = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1']], { toMove: 'w', turn: 3 });
    const move = movesOf(legalMoves(s), 'wQ1')[0] as Move;
    const s2 = applyMove(s, move);
    expect(s2.board.has('0,0')).toBe(false);
    if (move.type === 'move') {
      expect(s2.board.get(`${move.to.q},${move.to.r}`)).toEqual([tile('wQ1')]);
    }
    expect(s2.lastMoved).toEqual({ tile: tile('wQ1'), byPillbug: false });
  });

  it('pass increments passCount; anything else resets it', () => {
    const s = buildState([[-1, 0, 'bS1'], [0, 0, 'wQ1'], [1, 0, 'bQ1']], {
      toMove: 'w',
      hands: EMPTY_HANDS,
      passCount: 1,
    });
    const s2 = applyMove(s, { type: 'pass' });
    expect(s2.passCount).toBe(2);
    expect(s2.lastMoved).toBeUndefined();
  });

  it('never mutates its input state', () => {
    const s = initialState(BASE);
    const before = JSON.stringify({ hands: s.hands, size: s.board.size });
    applyMove(s, { type: 'place', tile: tile('wS1'), to: { q: 0, r: 0 } });
    expect(JSON.stringify({ hands: s.hands, size: s.board.size })).toBe(before);
  });
});

describe('result (T1.8)', () => {
  it('ongoing while no queen is surrounded', () => {
    const s = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1']]);
    expect(result(s)).toEqual({ status: 'ongoing' });
  });

  it('a surrounded queen loses (even under a beetle)', () => {
    const s = buildState([
      [0, 0, 'wQ1', 'bB1'],
      [1, 0, 'bQ1'],
      [-1, 0, 'bS1'],
      [1, -1, 'bA1'],
      [0, -1, 'bA2'],
      [0, 1, 'bG1'],
      [-1, 1, 'bG2'],
    ]);
    expect(result(s)).toEqual({ status: 'won', winner: 'b', by: 'surround' });
  });

  it('simultaneous double-surround is a draw', () => {
    // Two queens adjacent, jointly walled in.
    const s = buildState([
      [0, 0, 'wQ1'],
      [1, 0, 'bQ1'],
      [-1, 0, 'bS1'],
      [0, -1, 'bA1'],
      [1, -1, 'wA1'],
      [2, -1, 'wS1'],
      [2, 0, 'wA2'],
      [1, 1, 'wG1'],
      [0, 1, 'bG1'],
      [-1, 1, 'bA2'],
    ]);
    expect(result(s)).toEqual({ status: 'draw', by: 'surround' });
  });

  it('two consecutive passes do NOT end the game', () => {
    const s = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1']], { passCount: 2 });
    expect(result(s)).toEqual({ status: 'ongoing' });
  });
});
