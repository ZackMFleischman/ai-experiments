// T0.3 seed: proves vitest + fast-check are wired in @parlor/core. Real
// transport/log-session tests land with their porting tasks (lex T3.4).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PARLOR_CORE } from '../src/index.js';

describe('@parlor/core seed', () => {
  it('exposes the wiring probe', () => {
    expect(PARLOR_CORE).toEqual({ workspace: 'parlor', package: 'core' });
  });

  it('fast-check is wired', () => {
    fc.assert(fc.property(fc.string(), (s) => s.length >= 0));
  });
});
