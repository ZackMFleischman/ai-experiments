// T1.9: scripted full games replay to known final scores (IMPLEMENTATION §6).
// Each ply also re-derives the pinned GCG line (toGcg round-trip at every
// position) and checks the serialize identity.
import { describe, expect, it } from 'vitest';
import { RULESETS, applyMove, deserializeState, initialState, parseGcg, result, serializeState, toGcg } from '../src/index.js';
import { FULL_GAME, SCORELESS_GAME, TIE_GAME } from './fixtures/full-game.js';
import { riggedBagOrder, stubDict } from './helpers.js';

const dict = stubDict();

const FIXTURES = { FULL_GAME, SCORELESS_GAME, TIE_GAME };

describe.each(Object.entries(FIXTURES))('%s', (_name, fixture) => {
  it('replays to the pinned final position', () => {
    const ruleset = RULESETS[fixture.rulesetId]!;
    const order = riggedBagOrder(ruleset, fixture.startingRacks, fixture.bagPrefix);
    let state = initialState(ruleset, order, fixture.seats);

    for (const [index, line] of fixture.moves.entries()) {
      expect(result(state).status, `ply ${index} should still be ongoing`).toBe('ongoing');
      const move = parseGcg(line, state);
      expect(toGcg(move, state), `ply ${index} GCG re-derivation`).toBe(line);
      expect(deserializeState(serializeState(state))).toEqual(state);
      state = applyMove(state, move, dict);
    }

    expect([...state.scores]).toEqual(fixture.finalScores);
    expect(result(state)).toEqual({
      status: 'finished',
      winner: fixture.winner,
      by: fixture.endedBy,
      finalScores: fixture.finalScores,
    });
  });
});

describe('FULL_GAME exercises the required mechanics', () => {
  it('has a bingo, blanks, an exchange, and a played-out ending', () => {
    expect(FULL_GAME.moves[0]).toMatch(/\+68$/); // 7-tile opener: 18 + 50 bingo
    expect(FULL_GAME.moves.filter((m) => /[a-z]/.test(m.split(' ')[1] ?? ''))).not.toHaveLength(0); // blanks
    expect(FULL_GAME.moves).toContain('-AA'); // exchange
    expect(FULL_GAME.endedBy).toBe('played-out');
  });
});
