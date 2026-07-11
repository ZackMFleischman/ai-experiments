// applyCheckers's contract: purity, bookkeeping (moveCount / toMove / seen),
// rejection of every flavor of illegal move, and the resign/timeout folds.

import { describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  applyCheckers,
  initialCheckers,
  pieceAt,
  positionKey,
  resignCheckers,
  serializeCheckers,
  timeoutCheckers,
} from '../src/index.js';
import { at, pos } from './helpers.js';

describe('applyCheckers bookkeeping', () => {
  it('moves the piece, flips the turn, counts the move, records the position', () => {
    const s = initialCheckers();
    const next = applyCheckers(s, { from: at(0, 3), to: at(0, 1) });
    expect(pieceAt(next, at(0, 3))).toBe('.');
    expect(pieceAt(next, at(0, 1))).toBe('A');
    expect(next.toMove).toBe('defenders');
    expect(next.moveCount).toBe(1);
    expect(next.seen[positionKey(next.board, 'defenders')]).toBe(1);
    expect(next.result).toBeNull();
  });

  it('never mutates its input state', () => {
    const s = initialCheckers();
    const frozen = serializeCheckers(s);
    applyCheckers(s, { from: at(0, 3), to: at(0, 1) });
    expect(serializeCheckers(s)).toBe(frozen);
  });
});

describe('illegal moves', () => {
  const s = initialCheckers();

  it('rejects moving the opponent\'s piece', () => {
    expect(() => applyCheckers(s, { from: at(2, 3), to: at(2, 1) })).toThrow(IllegalMoveError);
  });

  it('rejects moving from an empty square', () => {
    expect(() => applyCheckers(s, { from: at(4, 4), to: at(4, 5) })).toThrow(IllegalMoveError);
  });

  it('rejects an occupied destination', () => {
    expect(() => applyCheckers(s, { from: at(0, 3), to: at(1, 3) })).toThrow(IllegalMoveError);
  });

  it('rejects diagonal movement', () => {
    expect(() => applyCheckers(s, { from: at(0, 3), to: at(1, 4) })).toThrow(IllegalMoveError);
  });

  it('rejects jumping over a piece', () => {
    expect(() => applyCheckers(s, { from: at(0, 3), to: at(2, 3) })).toThrow(IllegalMoveError);
  });

  it('rejects a non-king landing on a corner or the throne', () => {
    expect(() => applyCheckers(s, { from: at(0, 3), to: 0 })).toThrow(IllegalMoveError);
    const open = pos(
      `.......
       .......
       .......
       .A.....
       .......
       .....K.
       .......`,
      'attackers',
    );
    expect(() => applyCheckers(open, { from: at(3, 1), to: 24 })).toThrow(IllegalMoveError);
  });

  it('rejects any move once the game is over', () => {
    const done = resignCheckers(initialCheckers(), 'defenders');
    expect(() => applyCheckers(done, { from: at(0, 3), to: at(0, 1) })).toThrow(IllegalMoveError);

    const escape = pos(
      `...K...
       .......
       .......
       .......
       .......
       .......
       ..A....`,
      'defenders',
    );
    const won = applyCheckers(escape, { from: at(0, 3), to: 0 });
    expect(() => applyCheckers(won, { from: at(6, 2), to: at(6, 3) })).toThrow(IllegalMoveError);
  });
});

describe('resignCheckers / timeoutCheckers', () => {
  it('folds a resignation: the other side wins', () => {
    const next = resignCheckers(initialCheckers(), 'attackers');
    expect(next.result).toEqual({ winner: 'defenders', by: 'resign' });
    const other = resignCheckers(initialCheckers(), 'defenders');
    expect(other.result).toEqual({ winner: 'attackers', by: 'resign' });
  });

  it('folds a timeout: the other side wins', () => {
    const next = timeoutCheckers(initialCheckers(), 'defenders');
    expect(next.result).toEqual({ winner: 'attackers', by: 'timeout' });
  });

  it('leaves the input untouched and throws once the game is over', () => {
    const s = initialCheckers();
    const frozen = serializeCheckers(s);
    const done = resignCheckers(s, 'attackers');
    expect(serializeCheckers(s)).toBe(frozen);
    expect(() => resignCheckers(done, 'attackers')).toThrow(IllegalMoveError);
    expect(() => timeoutCheckers(done, 'defenders')).toThrow(IllegalMoveError);
  });
});
