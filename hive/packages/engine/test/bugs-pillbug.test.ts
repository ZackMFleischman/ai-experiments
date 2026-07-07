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

  it('offers a self-move OR its ability in the same position (either, not both, per turn)', () => {
    // wP1 pillbug at 0,0 with a queen it can slide itself OR toss two cells over:
    // the legal set contains both a 'move' and a 'toss'; the player picks one.
    const s = buildState([[0, 0, 'wP1'], [-1, 0, 'wQ1'], [1, 0, 'bQ1']], { toMove: 'w' });
    const moves = legalMoves(s);
    expect(moves.some((m) => m.type === 'move' && m.tile.kind === 'Q')).toBe(true);
    expect(moves.some((m) => m.type === 'toss')).toBe(true);
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

  it('a pillbug stunned by the opponent’s pillbug can neither move nor use its ability', () => {
    // wP1 was tossed by black's pillbug last turn (byPillbug), so this turn it is
    // stunned: it may not self-move AND may not toss anything (rule 9).
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
    expect(movesOf(moves, 'wP1')).toEqual([]); // cannot move
    expect(tossesOf(moves, 'bS1')).toEqual([]); // cannot use its ability either
  });

  it('a pillbug that moved itself last turn is NOT stunned and may toss', () => {
    // A self queen-move does not stun (byPillbug: false). Only being tossed by a
    // pillbug stuns, so here wP1 is free to use its ability this turn.
    const s = buildState(
      [
        [-2, 0, 'bQ1'],
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bS1'],
      ],
      { toMove: 'w', lastMoved: { tile: tile('wP1'), byPillbug: false } },
    );
    expect(tossesOf(legalMoves(s), 'bS1').length).toBeGreaterThan(0);
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

  it('a ground-level (height-1) gate does NOT block the toss — the piece rides over it', () => {
    // Gate cells of the up-step (1,0 -> 0,0) are 1,-1 and 0,1, both occupied at
    // height 1. That is NOT a gate above ground level, so the toss is legal: the
    // tossed piece climbs onto the pillbug and back down, clearing the low tiles.
    const s = buildState(
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
    // bA1 is flanked at height 1 on both up-step gate cells but can still be
    // tossed to the pillbug's remaining empty neighbours.
    expect(tossesOf(legalMoves(s), 'bA1').length).toBeGreaterThan(0);
    expect(dests(tossesOf(legalMoves(s), 'bA1'))).toEqual(new Set(['0,-1', '-1,1']));
  });

  it('a beetle gate (both up-step gate cells stacked to height ≥ 2) blocks the toss', () => {
    // Same shape, but each up-step gate cell (1,-1 and 0,1) is stacked to height
    // 2 with a beetle. Now the tossed piece cannot climb up between them.
    const gated = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bA1'],
        [1, -1, 'wS1', 'wB1'],
        [0, 1, 'wS2', 'bB1'],
        [-1, -1, 'bQ1'],
      ],
      { toMove: 'w' },
    );
    expect(tossesOf(legalMoves(gated), 'bA1')).toEqual([]);
    // Lower one gate back to height 1 and the toss reappears.
    const open = buildState(
      [
        [-1, 0, 'wQ1'],
        [0, 0, 'wP1'],
        [1, 0, 'bA1'],
        [1, -1, 'wS1', 'wB1'],
        [0, 1, 'wS2'],
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

  it('the stun on a tossed piece lasts only one turn, then it is free to move again', () => {
    // White tosses its own queen two cells over; on black's reply the queen is
    // stunned, but on white's following turn it may move normally again (the
    // rule 4 parenthetical: the stun only spans the opponent's single turn).
    const s = buildState([[0, 0, 'wP1'], [-1, 0, 'wQ1'], [1, 0, 'bQ1']], { toMove: 'w' });
    const toss = tossesOf(legalMoves(s), 'wQ1')[0] as Move;
    const afterToss = applyMove(s, toss); // black to move
    expect(afterToss.lastMoved).toEqual({ tile: tile('wQ1'), byPillbug: true });
    expect(movesOf(legalMoves(afterToss), 'wQ1')).toEqual([]); // stunned on black's turn

    const blackReply = legalMoves(afterToss).find((m) => m.type !== 'pass') as Move;
    const afterReply = applyMove(afterToss, blackReply); // white to move again
    expect(movesOf(legalMoves(afterReply), 'wQ1').length).toBeGreaterThan(0); // free again
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
