// applyTafl's contract: purity, bookkeeping (moveCount / toMove / seen),
// rejection of every flavor of illegal move, and the resign/timeout folds.

import { describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  applyTafl,
  initialTafl,
  pieceAt,
  positionKey,
  resignTafl,
  serializeTafl,
  timeoutTafl,
} from '../src/index.js';
import { at, pos } from './helpers.js';

describe('applyTafl bookkeeping', () => {
  it('moves the piece, flips the turn, counts the move, records the position', () => {
    const s = initialTafl();
    const next = applyTafl(s, { from: at(0, 3), to: at(0, 1) });
    expect(pieceAt(next, at(0, 3))).toBe('.');
    expect(pieceAt(next, at(0, 1))).toBe('A');
    expect(next.toMove).toBe('defenders');
    expect(next.moveCount).toBe(1);
    expect(next.seen[positionKey(next.board, 'defenders')]).toBe(1);
    expect(next.result).toBeNull();
  });

  it('never mutates its input state', () => {
    const s = initialTafl();
    const frozen = serializeTafl(s);
    applyTafl(s, { from: at(0, 3), to: at(0, 1) });
    expect(serializeTafl(s)).toBe(frozen);
  });
});

describe('illegal moves', () => {
  const s = initialTafl();

  it('rejects moving the opponent\'s piece', () => {
    expect(() => applyTafl(s, { from: at(3, 5), to: at(3, 3) })).toThrow(IllegalMoveError);
  });

  it('rejects moving from an empty square', () => {
    expect(() => applyTafl(s, { from: at(2, 2), to: at(2, 4) })).toThrow(IllegalMoveError);
  });

  it('rejects an occupied destination', () => {
    expect(() => applyTafl(s, { from: at(0, 3), to: at(0, 4) })).toThrow(IllegalMoveError);
  });

  it('rejects diagonal movement', () => {
    expect(() => applyTafl(s, { from: at(0, 3), to: at(1, 4) })).toThrow(IllegalMoveError);
  });

  it('rejects jumping over a piece', () => {
    expect(() => applyTafl(s, { from: at(0, 5), to: at(2, 5) })).toThrow(IllegalMoveError);
  });

  it('rejects a non-king landing on a corner or the throne', () => {
    expect(() => applyTafl(s, { from: at(0, 3), to: 0 })).toThrow(IllegalMoveError);
    const open = pos(
      `...........
       ...........
       ...........
       ...........
       ...........
       .A.........
       ...........
       ...........
       .........K.
       ...........
       ...........`,
      'attackers',
    );
    expect(() => applyTafl(open, { from: at(5, 1), to: 60 })).toThrow(IllegalMoveError);
  });

  it('rejects any move once the game is over', () => {
    const done = resignTafl(initialTafl(), 'defenders');
    expect(() => applyTafl(done, { from: at(0, 3), to: at(0, 1) })).toThrow(IllegalMoveError);

    const escape = pos(
      `...K.......
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ...........
       ..A........`,
      'defenders',
    );
    const won = applyTafl(escape, { from: at(0, 3), to: 0 });
    expect(() => applyTafl(won, { from: at(10, 2), to: at(10, 3) })).toThrow(IllegalMoveError);
  });
});

describe('resignTafl / timeoutTafl', () => {
  it('folds a resignation: the other side wins', () => {
    const next = resignTafl(initialTafl(), 'attackers');
    expect(next.result).toEqual({ winner: 'defenders', by: 'resign' });
    const other = resignTafl(initialTafl(), 'defenders');
    expect(other.result).toEqual({ winner: 'attackers', by: 'resign' });
  });

  it('folds a timeout: the other side wins', () => {
    const next = timeoutTafl(initialTafl(), 'defenders');
    expect(next.result).toEqual({ winner: 'attackers', by: 'timeout' });
  });

  it('leaves the input untouched and throws once the game is over', () => {
    const s = initialTafl();
    const frozen = serializeTafl(s);
    const done = resignTafl(s, 'attackers');
    expect(serializeTafl(s)).toBe(frozen);
    expect(() => resignTafl(done, 'attackers')).toThrow(IllegalMoveError);
    expect(() => timeoutTafl(done, 'defenders')).toThrow(IllegalMoveError);
  });
});
