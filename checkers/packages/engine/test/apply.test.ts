// applyCheckers's contract: purity, bookkeeping (moveCount / toMove / seen),
// rejection of every flavor of illegal path, and the resign/timeout folds.

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
    const next = applyCheckers(s, { path: [at(2, 1), at(3, 0)] });
    expect(pieceAt(next, at(2, 1))).toBe('.');
    expect(pieceAt(next, at(3, 0))).toBe('d');
    expect(next.toMove).toBe('light');
    expect(next.moveCount).toBe(1);
    expect(next.seen[positionKey(next.board, 'light')]).toBe(1);
    expect(next.result).toBeNull();
  });

  it('never mutates its input state', () => {
    const s = initialCheckers();
    const frozen = serializeCheckers(s);
    applyCheckers(s, { path: [at(2, 1), at(3, 0)] });
    expect(serializeCheckers(s)).toBe(frozen);
  });
});

describe('illegal moves', () => {
  const s = initialCheckers();

  it("rejects moving the opponent's piece", () => {
    expect(() => applyCheckers(s, { path: [at(5, 0), at(4, 1)] })).toThrow(IllegalMoveError);
  });

  it('rejects moving from an empty square', () => {
    expect(() => applyCheckers(s, { path: [at(3, 0), at(4, 1)] })).toThrow(IllegalMoveError);
  });

  it('rejects an occupied destination', () => {
    expect(() => applyCheckers(s, { path: [at(1, 0), at(2, 1)] })).toThrow(IllegalMoveError);
  });

  it('rejects a step onto a light square', () => {
    expect(() => applyCheckers(s, { path: [at(2, 1), at(3, 1)] })).toThrow(IllegalMoveError);
  });

  it('rejects a two-square glide that jumps nothing', () => {
    expect(() => applyCheckers(s, { path: [at(2, 1), at(4, 3)] })).toThrow(IllegalMoveError);
  });

  it('rejects a man moving backwards', () => {
    const open = pos(
      `........
       ........
       ........
       ..d.....
       ........
       ......l.
       ........
       ........`,
      'dark',
    );
    expect(() => applyCheckers(open, { path: [at(3, 2), at(2, 1)] })).toThrow(IllegalMoveError);
  });

  it('rejects paths that are too short to be moves', () => {
    expect(() => applyCheckers(s, { path: [] })).toThrow(IllegalMoveError);
    expect(() => applyCheckers(s, { path: [at(2, 1)] })).toThrow(IllegalMoveError);
  });

  it('rejects any move once the game is over', () => {
    const done = resignCheckers(initialCheckers(), 'light');
    expect(() => applyCheckers(done, { path: [at(2, 1), at(3, 0)] })).toThrow(IllegalMoveError);

    const lastMan = pos(
      `........
       ........
       ........
       ..d.....
       .l......
       ........
       ........
       ........`,
      'light',
    );
    const won = applyCheckers(lastMan, { path: [at(4, 1), at(2, 3)] });
    expect(won.result).toEqual({ winner: 'light', by: 'no-moves' });
    expect(() => applyCheckers(won, { path: [at(2, 3), at(1, 2)] })).toThrow(IllegalMoveError);
  });
});

describe('resignCheckers / timeoutCheckers', () => {
  it('folds a resignation: the other side wins', () => {
    const next = resignCheckers(initialCheckers(), 'dark');
    expect(next.result).toEqual({ winner: 'light', by: 'resign' });
    const other = resignCheckers(initialCheckers(), 'light');
    expect(other.result).toEqual({ winner: 'dark', by: 'resign' });
  });

  it('folds a timeout: the other side wins', () => {
    const next = timeoutCheckers(initialCheckers(), 'light');
    expect(next.result).toEqual({ winner: 'dark', by: 'timeout' });
  });

  it('leaves the input untouched and throws once the game is over', () => {
    const s = initialCheckers();
    const frozen = serializeCheckers(s);
    const done = resignCheckers(s, 'dark');
    expect(serializeCheckers(s)).toBe(frozen);
    expect(() => resignCheckers(done, 'dark')).toThrow(IllegalMoveError);
    expect(() => timeoutCheckers(done, 'light')).toThrow(IllegalMoveError);
  });
});
