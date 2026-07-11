// Movement: rook rays, blocking, and the restricted-square rules — only the
// king lands on throne/corners, anyone slides across the throne while it is
// empty, an occupied throne blocks like any piece.

import { describe, expect, it } from 'vitest';
import {
  THRONE,
  allLegalMoves,
  initialTafl,
  legalDestinations,
  pieceAt,
  resignTafl,
} from '../src/index.js';
import { at, pos } from './helpers.js';

const sorted = (cells: number[]): number[] => [...cells].sort((a, b) => a - b);

describe('rook movement', () => {
  it('slides any distance along rank and file until blocked', () => {
    const s = initialTafl();
    // d1 attacker: blocked below by d2's attacker; corners a1/g1 not landable.
    expect(sorted(legalDestinations(s, at(0, 3)))).toEqual([at(0, 1), at(0, 2), at(0, 4), at(0, 5)]);
    // a4 attacker: blocked right by b4; corners a1/a7 not landable.
    expect(sorted(legalDestinations(s, at(3, 0)))).toEqual([at(1, 0), at(2, 0), at(4, 0), at(5, 0)]);
  });

  it('cannot jump over any piece', () => {
    const s = initialTafl();
    // d2's attacker is boxed vertically by d1 and d3 — only lateral moves.
    const dests = legalDestinations(s, at(1, 3));
    expect(dests).not.toContain(at(2, 3));
    expect(dests).not.toContain(at(0, 3));
    expect(sorted(dests)).toEqual([at(1, 0), at(1, 1), at(1, 2), at(1, 4), at(1, 5), at(1, 6)]);
  });

  it('generates exactly the 40 opening moves for the attackers', () => {
    const s = initialTafl();
    const moves = allLegalMoves(s);
    expect(moves).toHaveLength(40);
    for (const move of moves) expect(pieceAt(s, move.from)).toBe('A');
  });
});

describe('restricted squares', () => {
  it('non-king pieces may pass over the empty throne but never land on it', () => {
    const s = pos(
      `.......
       .......
       .......
       .....D.
       .......
       ..K....
       .......`,
      'defenders',
    );
    const dests = legalDestinations(s, at(3, 5));
    expect(dests).not.toContain(THRONE);
    expect(dests).toContain(at(3, 2)); // beyond the throne — slid across it
    expect(dests).toContain(at(3, 0));
  });

  it('attackers pass over the empty throne too', () => {
    const s = pos(
      `.......
       .......
       .......
       .A.....
       .......
       .....K.
       .......`,
      'attackers',
    );
    const dests = legalDestinations(s, at(3, 1));
    expect(dests).not.toContain(THRONE);
    expect(dests).toContain(at(3, 5));
  });

  it('an occupied throne blocks the ray like any piece', () => {
    const s = pos(
      `.......
       .......
       .......
       ...K.D.
       .......
       .......
       .......`,
      'defenders',
    );
    const dests = legalDestinations(s, at(3, 5));
    expect(dests).toContain(at(3, 4));
    expect(dests).not.toContain(THRONE);
    expect(dests).not.toContain(at(3, 2)); // can't cross the king
  });

  it('non-king pieces may not land on corners', () => {
    const s = initialTafl();
    expect(legalDestinations(s, at(0, 3))).not.toContain(0);
    expect(legalDestinations(s, at(0, 3))).not.toContain(6);
  });

  it('the king may land on corners and re-enter the throne', () => {
    const s = pos(
      `...K...
       .......
       .......
       .......
       .......
       .......
       ...A...`,
      'defenders',
    );
    const dests = legalDestinations(s, at(0, 3));
    expect(dests).toContain(0); // a1 corner
    expect(dests).toContain(6); // g1 corner
    expect(dests).toContain(THRONE); // straight down column d onto the throne
  });
});

describe('legalDestinations edges', () => {
  it('returns [] for empty squares and the opponent\'s pieces', () => {
    const s = initialTafl();
    expect(legalDestinations(s, at(2, 3))).toEqual([]); // defender, attackers to move
    expect(legalDestinations(s, at(4, 4))).toEqual([]); // empty
    expect(legalDestinations(s, -3)).toEqual([]);
    expect(legalDestinations(s, 49)).toEqual([]);
  });

  it('returns [] (and allLegalMoves []) once the game is over', () => {
    const done = resignTafl(initialTafl(), 'attackers');
    expect(legalDestinations(done, at(0, 3))).toEqual([]);
    expect(allLegalMoves(done)).toEqual([]);
  });
});
