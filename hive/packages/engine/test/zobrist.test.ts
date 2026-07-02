import { describe, expect, it } from 'vitest';
import { applyMove, hash, initialState, legalMoves, result } from '../src/index';
import type { GameState, Move } from '../src/index';
import { BASE, buildState } from './helpers';

describe('zobrist hashing (T1.10)', () => {
  it('is a pure function of board + side to move', () => {
    const a = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1']], { toMove: 'w' });
    const b = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1']], { toMove: 'w', turn: 9 });
    expect(hash(a)).toBe(hash(b)); // turn counter is not part of the position
  });

  it('differs by side to move', () => {
    const a = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1']], { toMove: 'w' });
    const b = buildState([[0, 0, 'wQ1'], [1, 0, 'bQ1']], { toMove: 'b' });
    expect(hash(a)).not.toBe(hash(b));
  });

  it('differs by stack order and by tile identity', () => {
    const a = buildState([[0, 0, 'wQ1', 'bB1'], [1, 0, 'bQ1']]);
    const b = buildState([[0, 0, 'bB1', 'wQ1'], [1, 0, 'bQ1']]);
    expect(hash(a)).not.toBe(hash(b));
    const c = buildState([[0, 0, 'wA1'], [1, 0, 'bQ1']]);
    const d = buildState([[0, 0, 'wA2'], [1, 0, 'bQ1']]);
    expect(hash(c)).not.toBe(hash(d));
  });

  it('applyMove appends the new position hash', () => {
    let s = initialState(BASE);
    expect(s.positionHashes).toHaveLength(0);
    s = applyMove(s, { type: 'place', tile: { color: 'w', kind: 'S', ordinal: 1 }, to: { q: 0, r: 0 } });
    expect(s.positionHashes).toHaveLength(1);
    expect(s.positionHashes[0]).toBe(hash(s));
  });
});

describe('threefold repetition (T1.10)', () => {
  // Two ants oscillate at the ends of a line. The synthetic start position is
  // not in positionHashes (only reached positions are), so the third *recorded*
  // occurrence lands after three full 4-ply cycles.
  function oscillate(s: GameState, plies: number): GameState {
    const cycle: Array<{ tile: string; to: [number, number] }> = [
      { tile: 'wA1', to: [0, -1] },
      { tile: 'bA1', to: [2, -1] },
      { tile: 'wA1', to: [-1, 0] },
      { tile: 'bA1', to: [2, 0] },
    ];
    for (let i = 0; i < plies; i++) {
      const step = cycle[i % 4] as { tile: string; to: [number, number] };
      const move = legalMoves(s).find(
        (m): m is Extract<Move, { type: 'move' }> =>
          m.type === 'move' &&
          `${m.tile.color}${m.tile.kind}${m.tile.ordinal}` === step.tile &&
          m.to.q === step.to[0] &&
          m.to.r === step.to[1],
      );
      if (!move) throw new Error(`oscillation step ${i} not legal`);
      s = applyMove(s, move);
    }
    return s;
  }

  const start = () =>
    buildState(
      [
        [-1, 0, 'wA1'],
        [0, 0, 'wQ1'],
        [1, 0, 'bQ1'],
        [2, 0, 'bA1'],
      ],
      { toMove: 'w', turn: 5, options: BASE },
    );

  it('draws by repetition once a recorded position recurs a third time', () => {
    // The position after ply 1 recurs after plies 5 and 9 — third occurrence.
    const s = oscillate(start(), 9);
    expect(result(s)).toEqual({ status: 'draw', by: 'repetition' });
  });

  it('two recorded occurrences are not yet a draw', () => {
    const s = oscillate(start(), 8);
    expect(result(s)).toEqual({ status: 'ongoing' });
  });

  it('a drawn-by-repetition game offers no further moves', () => {
    const s = oscillate(start(), 9);
    expect(legalMoves(s)).toEqual([]);
  });
});
