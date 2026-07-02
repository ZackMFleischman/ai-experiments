import { describe, expect, it } from 'vitest';
import { BUG_DESTINATIONS } from '../src/bugs/index';
import { mosquitoDestinations as rawMosquito } from '../src/bugs/mosquito';
import { legalMoves } from '../src/index';
import type { Board } from '../src/state';
import type { Hex, Move } from '../src/index';
import { buildState, hex, movesOf } from './helpers';

const mosquitoDestinations = (board: Board, from: Hex) => rawMosquito(board, from, BUG_DESTINATIONS);

const keys = (hs: Array<{ q: number; r: number }>) => new Set(hs.map((h) => `${h.q},${h.r}`));

function tossesBy(moves: Move[], byKey: string): Array<Extract<Move, { type: 'toss' }>> {
  return moves.filter(
    (m): m is Extract<Move, { type: 'toss' }> =>
      m.type === 'toss' && `${m.by.color}${m.by.kind}${m.by.ordinal}` === byKey,
  );
}

describe('mosquito (T2.3)', () => {
  it('copies the movement of each adjacent piece (union)', () => {
    // wM1 adjacent to a grasshopper and a queen: gets hopper jumps + queen slides.
    const s = buildState([
      [0, 0, 'wM1'],
      [1, 0, 'bG1'],
      [0, 1, 'bQ1'],
    ]);
    const dests = keys(mosquitoDestinations(s.board, hex(0, 0)));
    expect(dests).toContain('2,0'); // grasshopper jump E over bG1
    expect(dests).toContain('0,2'); // grasshopper jump SE over bQ1
    expect(dests).toContain('1,-1'); // queen slide
    expect(dests).toContain('-1,1'); // queen slide
  });

  it('adjacent only to another mosquito: cannot move at all', () => {
    const s = buildState([
      [0, 0, 'wM1'],
      [1, 0, 'bM1'],
    ]);
    expect(mosquitoDestinations(s.board, hex(0, 0))).toEqual([]);
  });

  it('on top of the hive it moves only as a beetle until it climbs down', () => {
    // wM1 sits on bG1. If it copied the grasshopper it could leap; it must not.
    const s = buildState([
      [1, 0, 'bG1', 'wM1'],
      [2, 0, 'bQ1'],
    ]);
    const dests = keys(mosquitoDestinations(s.board, hex(1, 0)));
    // Beetle-from-top reach: the six neighbors.
    expect(dests).toEqual(new Set(['0,0', '2,0', '2,-1', '1,-1', '1,1', '0,1']));
  });

  it('copying a beetle lets it climb', () => {
    const s = buildState([
      [0, 0, 'wM1'],
      [1, 0, 'bB1'],
      [2, 0, 'bQ1'],
    ]);
    expect(keys(mosquitoDestinations(s.board, hex(0, 0)))).toContain('1,0'); // climbs onto the beetle
  });

  it('copying a pillbug grants the toss, subject to all pillbug constraints', () => {
    // wM1 adjacent to bP1 (copies it) and to the tossable bA1 leaf.
    const s = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'wM1'],
        [0, -1, 'bP1'],
        [1, 0, 'bA1'],
        [-1, -1, 'bQ1'],
      ],
      { toMove: 'w' },
    );
    const tosses = tossesBy(legalMoves(s), 'wM1');
    const tossedTiles = new Set(tosses.map((t) => `${t.tile.color}${t.tile.kind}${t.tile.ordinal}`));
    expect(tossedTiles).toContain('bA1'); // enemy neighbor is tossable
    // Constraint carries over: the just-moved piece cannot be tossed.
    const s2 = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'wM1'],
        [0, -1, 'bP1'],
        [1, 0, 'bA1'],
        [-1, -1, 'bQ1'],
      ],
      { toMove: 'w', lastMoved: { tile: { color: 'b', kind: 'A', ordinal: 1 }, byPillbug: false } },
    );
    const afterMove = tossesBy(legalMoves(s2), 'wM1').map(
      (t) => `${t.tile.color}${t.tile.kind}${t.tile.ordinal}`,
    );
    expect(afterMove).not.toContain('bA1');
  });

  it('a mosquito on top of the hive does not toss even next to a pillbug', () => {
    const s = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'bS1', 'wM1'],
        [0, -1, 'bP1'],
        [1, 0, 'bA1'],
        [-1, -1, 'bQ1'],
      ],
      { toMove: 'w' },
    );
    expect(tossesBy(legalMoves(s), 'wM1')).toEqual([]);
  });

  it('mosquito self-moves appear in legalMoves through the registry', () => {
    // Leaf mosquito next to the white queen: copies Q and slides.
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wM1'],
      ],
      { toMove: 'w' },
    );
    expect(movesOf(legalMoves(s), 'wM1').length).toBeGreaterThan(0);
  });
});
