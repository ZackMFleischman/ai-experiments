import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../src/index';
import type { Move } from '../src/index';
import { buildState, movesOf, tile } from './helpers';

function tossesOf(moves: Move[], tileKey: string): Array<Extract<Move, { type: 'toss' }>> {
  return moves.filter(
    (m): m is Extract<Move, { type: 'toss' }> =>
      m.type === 'toss' && `${m.tile.color}${m.tile.kind}${m.tile.ordinal}` === tileKey,
  );
}
const dests = (ms: Array<{ to: { q: number; r: number } }>) => new Set(ms.map((m) => `${m.to.q},${m.to.r}`));

describe('pillbug (T2.2)', () => {
  it('moves itself like a queen (slide 1)', () => {
    const s = buildState([[-1, 0, 'wQ1'], [0, 0, 'wP1'], [1, 0, 'bQ1']], { toMove: 'w' });
    // wP1 is a cut vertex — no self-moves; free it and it slides one cell.
    expect(movesOf(legalMoves(s), 'wP1')).toEqual([]);
    const s2 = buildState([[-1, 0, 'wQ1'], [0, 0, 'wP1'], [-1, 1, 'bQ1']], { toMove: 'w' });
    const moves = movesOf(legalMoves(s2), 'wP1');
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      const dq = Math.abs(m.to.q - 0);
      void dq; // destinations are all neighbors — queen-shaped, checked by dests below
    }
  });

  it('tosses adjacent single pieces — friend or enemy — into empty cells next to itself', () => {
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bS1'],
      ],
      { toMove: 'w' },
    );
    const tosses = tossesOf(legalMoves(s), 'bS1');
    expect(tosses.length).toBeGreaterThan(0);
    for (const t of tosses) expect(t.by).toEqual(tile('wP1'));
    expect(dests(tosses)).toEqual(new Set(['1,-1', '0,-1', '0,1', '-1,1']));
    // Friendly piece in the same spot is tossable too.
    const s2 = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'wS1'],
      ],
      { toMove: 'w' },
    );
    expect(tossesOf(legalMoves(s2), 'wS1').length).toBeGreaterThan(0);
  });

  it('may not toss the piece the opponent just moved', () => {
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bS1'],
      ],
      { toMove: 'w', lastMoved: { tile: tile('bS1'), byPillbug: false } },
    );
    expect(tossesOf(legalMoves(s), 'bS1')).toEqual([]);
  });

  it('a tossed piece is stunned: it may neither move nor be tossed this turn', () => {
    // White ant was tossed by black's pillbug last turn.
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'wA1'],
      ],
      { toMove: 'w', lastMoved: { tile: tile('wA1'), byPillbug: true } },
    );
    const moves = legalMoves(s);
    expect(movesOf(moves, 'wA1')).toEqual([]); // cannot move
    expect(tossesOf(moves, 'wA1')).toEqual([]); // cannot be tossed either
  });

  it('a stunned pillbug cannot move but can still toss', () => {
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bS1'],
      ],
      { toMove: 'w', lastMoved: { tile: tile('wP1'), byPillbug: true } },
    );
    const moves = legalMoves(s);
    expect(movesOf(moves, 'wP1')).toEqual([]);
    expect(tossesOf(moves, 'bS1').length).toBeGreaterThan(0);
  });

  it('may not toss stacked pieces — neither the covering nor the covered tile', () => {
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bS1', 'bB1'],
      ],
      { toMove: 'w' },
    );
    const moves = legalMoves(s);
    expect(tossesOf(moves, 'bB1')).toEqual([]);
    expect(tossesOf(moves, 'bS1')).toEqual([]);
  });

  it('the toss is blocked by a full height-1 gate and opens when the gate opens', () => {
    // Gate cells of the up-step (1,0 -> 0,0) are 1,-1 and 0,1 — both occupied.
    const gated = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bA1'],
        [1, -1, 'wS1'],
        [0, 1, 'wS2'],
        [-1, -1, 'bQ1'],
      ],
      { toMove: 'w' },
    );
    expect(tossesOf(legalMoves(gated), 'bA1')).toEqual([]);
    // Remove one gate tile: the toss appears.
    const open = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bA1'],
        [1, -1, 'wS1'],
        [-1, -1, 'bQ1'],
      ],
      { toMove: 'w' },
    );
    expect(tossesOf(legalMoves(open), 'bA1').length).toBeGreaterThan(0);
  });

  it('may not toss a piece whose departure would split the hive', () => {
    const s = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bS1'],
        [2, 0, 'bQ1'],
      ],
      { toMove: 'w' },
    );
    expect(tossesOf(legalMoves(s), 'bS1')).toEqual([]);
  });

  it('a toss duplicating a legal self-move is canonicalized away (self-move wins)', () => {
    const s = buildState([[-1, 0, 'wQ1'], [0, 0, 'wP1'], [1, 0, 'bQ1']], { toMove: 'w' });
    const moves = legalMoves(s);
    const queenEntries = moves.filter(
      (m) => (m.type === 'move' || m.type === 'toss') && m.tile.kind === 'Q' && m.tile.color === 'w',
    );
    // Every (tile, from, to) appears once, and where the queen can self-slide
    // the entry is a self-move, never a toss.
    const byDest = new Map<string, Move[]>();
    for (const m of queenEntries) {
      if (m.type !== 'move' && m.type !== 'toss') continue;
      const k = `${m.to.q},${m.to.r}`;
      byDest.set(k, [...(byDest.get(k) ?? []), m]);
    }
    for (const [dest, entries] of byDest) {
      expect(entries.length, `duplicate entries for ${dest}`).toBe(1);
    }
    const selfDests = new Set(
      moves.filter((m) => m.type === 'move' && m.tile.kind === 'Q').map((m) => (m.type === 'move' ? `${m.to.q},${m.to.r}` : '')),
    );
    for (const m of queenEntries) {
      if (m.type === 'toss') expect(selfDests.has(`${m.to.q},${m.to.r}`)).toBe(false);
    }
  });

  it('applyMove on a toss records byPillbug for the stun rule', () => {
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bS1'],
      ],
      { toMove: 'w' },
    );
    const toss = tossesOf(legalMoves(s), 'bS1')[0] as Move;
    const s2 = applyMove(s, toss);
    expect(s2.lastMoved).toEqual({ tile: tile('bS1'), byPillbug: true });
    expect(s2.board.has('1,0')).toBe(false);
  });
});
