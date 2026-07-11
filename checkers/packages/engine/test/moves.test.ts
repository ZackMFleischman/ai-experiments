// Movement legality: men step diagonally forward, kings both ways, captures
// are mandatory when available, multi-jumps must run to completion (with the
// player free to pick among branches), and finished games offer nothing.

import { describe, expect, it } from 'vitest';
import {
  allLegalMoves,
  initialCheckers,
  legalMovesFrom,
  pieceAt,
  resignCheckers,
} from '../src/index.js';
import { at, pos } from './helpers.js';

const paths = (moves: { path: number[] }[]): number[][] =>
  moves.map((m) => m.path).sort((a, b) => String(a).localeCompare(String(b)));

describe('simple moves', () => {
  it('a man steps one square diagonally to an empty dark square', () => {
    const s = initialCheckers();
    // b3 (row 2) is on dark's front rank: both forward diagonals are open.
    expect(paths(legalMovesFrom(s, at(2, 1)))).toEqual(
      paths([{ path: [at(2, 1), at(3, 0)] }, { path: [at(2, 1), at(3, 2)] }]),
    );
    // h3 sits on the edge: only one forward diagonal stays on the board.
    expect(paths(legalMovesFrom(s, at(2, 7)))).toEqual(paths([{ path: [at(2, 7), at(3, 6)] }]));
  });

  it('own pieces block: the back ranks cannot move at the start', () => {
    const s = initialCheckers();
    expect(legalMovesFrom(s, at(0, 1))).toEqual([]);
    expect(legalMovesFrom(s, at(1, 0))).toEqual([]);
  });

  it('generates exactly the 7 opening moves for dark', () => {
    const s = initialCheckers();
    const moves = allLegalMoves(s);
    expect(moves).toHaveLength(7);
    for (const move of moves) {
      expect(pieceAt(s, move.path[0] as number)).toBe('d');
      expect(move.path).toHaveLength(2);
    }
  });

  it('men move forward only — dark down the board, light up', () => {
    const dark = pos(
      `........
       ........
       ........
       ...d....
       ........
       ........
       ........
       ........`,
      'dark',
    );
    expect(paths(legalMovesFrom(dark, at(3, 3)))).toEqual(
      paths([{ path: [at(3, 3), at(4, 2)] }, { path: [at(3, 3), at(4, 4)] }]),
    );
    const light = pos(
      `........
       ........
       ........
       ........
       ....l...
       ........
       ........
       ........`,
      'light',
    );
    expect(paths(legalMovesFrom(light, at(4, 4)))).toEqual(
      paths([{ path: [at(4, 4), at(3, 3)] }, { path: [at(4, 4), at(3, 5)] }]),
    );
  });

  it('kings move one step in all four diagonal directions', () => {
    const s = pos(
      `........
       ........
       ........
       ...D....
       ........
       ........
       ........
       ........`,
      'dark',
    );
    expect(paths(legalMovesFrom(s, at(3, 3)))).toEqual(
      paths([
        { path: [at(3, 3), at(2, 2)] },
        { path: [at(3, 3), at(2, 4)] },
        { path: [at(3, 3), at(4, 2)] },
        { path: [at(3, 3), at(4, 4)] },
      ]),
    );
  });
});

describe('mandatory capture', () => {
  const s = pos(
    `.d......
     ........
     .d.d....
     ..l.....
     ........
     ........
     ........
     ........`,
    'dark',
  );

  it('when a jump exists, only jump moves are generated', () => {
    expect(paths(allLegalMoves(s))).toEqual(
      paths([{ path: [at(2, 1), at(4, 3)] }, { path: [at(2, 3), at(4, 1)] }]),
    );
  });

  it('a piece with no jump gets nothing while another piece must jump', () => {
    expect(legalMovesFrom(s, at(0, 1))).toEqual([]);
  });
});

describe('multi-jump sequences', () => {
  it('a sequence must continue while the same piece can jump again', () => {
    const s = pos(
      `........
       .d......
       ..l.....
       ........
       ....l...
       ........
       ........
       ........`,
      'dark',
    );
    // Stopping at d4 is not an option: the only complete path double-jumps.
    expect(paths(legalMovesFrom(s, at(1, 1)))).toEqual(
      paths([{ path: [at(1, 1), at(3, 3), at(5, 5)] }]),
    );
  });

  it('the player picks freely among jump branches (no maximal-capture rule)', () => {
    const s = pos(
      `........
       .d......
       ..l.....
       ........
       ..l.l...
       ........
       ........
       ........`,
      'dark',
    );
    expect(paths(legalMovesFrom(s, at(1, 1)))).toEqual(
      paths([
        { path: [at(1, 1), at(3, 3), at(5, 1)] },
        { path: [at(1, 1), at(3, 3), at(5, 5)] },
      ]),
    );
  });

  it('a jump needs an empty landing square beyond the enemy', () => {
    const s = pos(
      `........
       .d......
       ..l.....
       ...l....
       ........
       ........
       ........
       ........`,
      'dark',
    );
    // The landing square is occupied, so no jump — the simple move remains.
    expect(paths(legalMovesFrom(s, at(1, 1)))).toEqual(paths([{ path: [at(1, 1), at(2, 0)] }]));
  });
});

describe('legalMovesFrom edges', () => {
  it("returns [] for empty squares and the opponent's pieces", () => {
    const s = initialCheckers();
    expect(legalMovesFrom(s, at(5, 0))).toEqual([]); // light man, dark to move
    expect(legalMovesFrom(s, at(3, 0))).toEqual([]); // empty
    expect(legalMovesFrom(s, -3)).toEqual([]);
    expect(legalMovesFrom(s, 64)).toEqual([]);
  });

  it('returns [] (and allLegalMoves []) once the game is over', () => {
    const done = resignCheckers(initialCheckers(), 'dark');
    expect(legalMovesFrom(done, at(2, 1))).toEqual([]);
    expect(allLegalMoves(done)).toEqual([]);
  });
});
