// T2.5: the pinned ENABLE game replays to its known final position through
// the REAL compiled dictionary — the whole stack (normalize → DAWG → decode →
// applyMove verdict pipeline) in one pass.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { RULESETS, applyMove, initialState, parseGcg, result, toGcg, type TileFace } from '@lex/engine';
import { buildDawg, decodeDawg, type DawgDictionary } from '../src/dawg.js';
import { normalizeWordList } from '../src/wordlist.js';
import { ENABLE1_GAME } from './fixtures/enable1-game.js';

let dict: DawgDictionary;

beforeAll(() => {
  const raw = readFileSync(new URL('../words/enable1.txt', import.meta.url), 'utf8');
  const words = normalizeWordList(raw);
  const hash = createHash('sha256').update(words.join('\n')).digest('hex');
  dict = decodeDawg(buildDawg(words, 'enable1', hash));
});

describe('ENABLE full-game fixture', () => {
  it('replays to the pinned played-out finish', () => {
    const ruleset = RULESETS[ENABLE1_GAME.rulesetId]!;
    const bagOrder = ENABLE1_GAME.bagOrder.split('') as TileFace[];
    let state = initialState(ruleset, bagOrder, ENABLE1_GAME.seats);

    for (const [index, line] of ENABLE1_GAME.moves.entries()) {
      expect(result(state).status, `ply ${index}`).toBe('ongoing');
      const move = parseGcg(line, state);
      expect(toGcg(move, state), `ply ${index} GCG re-derivation`).toBe(line);
      state = applyMove(state, move, dict); // throws if any word were invalid
    }

    expect([...state.scores]).toEqual(ENABLE1_GAME.finalScores);
    expect(result(state)).toEqual({
      status: 'finished',
      standings: ENABLE1_GAME.standings,
      by: ENABLE1_GAME.endedBy,
      finalScores: ENABLE1_GAME.finalScores,
    });
  });

  it('exercises exchanges and both blanks', () => {
    expect(ENABLE1_GAME.moves.filter((m) => m.startsWith('-'))).toHaveLength(4);
    const blanks = ENABLE1_GAME.moves.flatMap((m) => (m.split(' ')[1] ?? '').match(/[a-z]/g) ?? []);
    expect(blanks.length).toBeGreaterThanOrEqual(2);
  });
});
