// T2.4: the pinned edge-case pack + full-game fixtures, all phrased in UHP.
import { describe, expect, it } from 'vitest';
import edgeCases from './fixtures/expansions/edge-cases.json';
import expansionsGame from './fixtures/expansions/full-game-expansions.json';
import repetitionGame from './fixtures/expansions/full-game-repetition.json';
import type { Color, GameOptions, GameState, Move } from '../src/index';
import { applyMove, initialState, legalMoves, parseUhp, result, toUhp } from '../src/index';
import { parseTileKey } from '../src/state';
import { ALL_ON, buildState } from './helpers';

interface EdgeCase {
  name: string;
  cells: Array<[number, number, ...string[]]>;
  toMove: string;
  turn?: number;
  passCount?: number;
  lastMoved?: { tile: string; byPillbug: boolean };
  emptyHands?: string[];
  onlyPass?: boolean;
  expectResult?: 'ongoing' | 'draw-surround';
  legal: string[];
  illegal: string[];
  selfMove?: string[];
}

function stateFor(c: EdgeCase): GameState {
  const base = buildState(c.cells, {
    toMove: c.toMove as Color,
    turn: c.turn ?? 5,
    passCount: c.passCount ?? 0,
    options: ALL_ON,
    ...(c.lastMoved
      ? { lastMoved: { tile: parseTileKey(c.lastMoved.tile), byPillbug: c.lastMoved.byPillbug } }
      : {}),
  });
  if (!c.emptyHands?.length) return base;
  const zero = { Q: 0, A: 0, S: 0, G: 0, B: 0, M: 0, L: 0, P: 0 };
  const hands = { w: { ...base.hands.w }, b: { ...base.hands.b } };
  for (const color of c.emptyHands) hands[color as Color] = { ...zero };
  return { ...base, hands };
}

describe('pinned edge-case fixtures (T2.4)', () => {
  for (const c of edgeCases.cases as unknown as EdgeCase[]) {
    it(c.name, () => {
      const s = stateFor(c);
      for (const uhp of c.legal) {
        expect(() => applyMove(s, parseUhp(uhp, s)), `should be legal: ${uhp}`).not.toThrow();
      }
      for (const uhp of c.illegal) {
        expect(() => applyMove(s, parseUhp(uhp, s)), `should be illegal: ${uhp}`).toThrow();
      }
      for (const uhp of c.selfMove ?? []) {
        const m = parseUhp(uhp, s);
        expect(m.type, `${uhp} must canonicalize to self-move`).toBe('move');
        const after = applyMove(s, m);
        expect(after.lastMoved?.byPillbug, `${uhp} must not stun`).toBe(false);
      }
      if (c.onlyPass) expect(legalMoves(s)).toEqual([{ type: 'pass' }]);
      if (c.expectResult === 'ongoing') expect(result(s)).toEqual({ status: 'ongoing' });
      if (c.expectResult === 'draw-surround') {
        expect(result(s)).toEqual({ status: 'draw', by: 'surround' });
      }
    });
  }
});

function replay(fixture: { options: GameOptions; moves: string[] }): {
  final: GameState;
  played: Move[];
} {
  let s = initialState(fixture.options);
  const played: Move[] = [];
  for (const uhp of fixture.moves) {
    const m = parseUhp(uhp, s);
    expect(parseUhp(toUhp(m, s), s), `round-trip at: ${uhp}`).toEqual(m);
    played.push(m);
    s = applyMove(s, m);
  }
  return { final: s, played };
}

describe('full-game fixtures (T2.4)', () => {
  it('all-expansions game replays to a white surround win with toss/mosquito/ladybug moves', () => {
    const { final, played } = replay(expansionsGame as never);
    expect(result(final)).toEqual(expansionsGame.expected);

    const at = expansionsGame.mustContain;
    expect(played[at.toss - 1]?.type, 'the pinned toss ply').toBe('toss');
    const lady = played[at.ladybugMove - 1] as Move;
    expect(lady.type === 'move' && lady.tile.kind === 'L', 'the pinned ladybug ply').toBe(true);
    const mosq = played[at.mosquitoMove - 1] as Move;
    expect(mosq.type === 'move' && mosq.tile.kind === 'M', 'the pinned mosquito ply').toBe(true);
  });

  it('repetition game replays to a threefold-repetition draw', () => {
    const { final } = replay(repetitionGame as never);
    expect(result(final)).toEqual(repetitionGame.expected);
  });
});
