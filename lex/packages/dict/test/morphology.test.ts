// T8.1: the gloss-lookup reduction table. It is a spelling heuristic, not a
// legality rule — nothing here may ever decide whether a word is playable —
// so what these pin is that it is deterministic, never returns the word it was
// given, and never proposes a base too short to be a word.
import { describe, expect, it } from 'vitest';
import { morphBases } from '../src/morphology.js';

describe('morphBases', () => {
  it('reduces regular plurals and verb forms to their lemma', () => {
    expect(morphBases('CATS')).toContain('CAT');
    expect(morphBases('BOXES')).toContain('BOX');
    expect(morphBases('CHURCHES')).toContain('CHURCH');
    expect(morphBases('PONIES')).toContain('PONY');
    expect(morphBases('WALKED')).toContain('WALK');
    expect(morphBases('WALKING')).toContain('WALK');
    expect(morphBases('MAKING')).toContain('MAKE');
    expect(morphBases('WOMEN')).toContain('WOMAN');
  });

  it('undoes a doubled final consonant', () => {
    expect(morphBases('RUNNING')).toContain('RUN');
    expect(morphBases('BIGGEST')).toContain('BIG');
    expect(morphBases('STOPPED')).toContain('STOP');
  });

  it('reduces comparatives, superlatives, and adverbs', () => {
    expect(morphBases('HAPPIER')).toContain('HAPPY');
    expect(morphBases('HAPPIEST')).toContain('HAPPY');
    expect(morphBases('QUICKLY')).toContain('QUICK');
    expect(morphBases('EASILY')).toContain('EASY');
  });

  it('never returns the word itself, a duplicate, or a single letter', () => {
    for (const word of ['CATS', 'AS', 'IS', 'ES', 'RUNNING', 'BE', 'SEES', 'ODES']) {
      const bases = morphBases(word);
      expect(bases).not.toContain(word);
      expect(new Set(bases).size).toBe(bases.length);
      expect(bases.every((base) => base.length >= 2)).toBe(true);
    }
  });

  it('is deterministic and order-stable', () => {
    expect(morphBases('CARRIES')).toEqual(morphBases('CARRIES'));
    // Most specific rule first: IES→Y beats ES→E and S→''.
    expect(morphBases('CARRIES')[0]).toBe('CARRY');
  });

  it('proposes nothing for a word with no reducible ending', () => {
    expect(morphBases('QI')).toEqual([]);
    expect(morphBases('ZA')).toEqual([]);
  });
});
