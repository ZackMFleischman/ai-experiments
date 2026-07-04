// T0.3 seed: proves vitest is wired in @parlor/harness. The gallery runtime +
// validate script cores land with lex T3.11.
import { describe, expect, it } from 'vitest';
import { PARLOR_HARNESS } from '../src/index.js';

describe('@parlor/harness seed', () => {
  it('exposes the wiring probe', () => {
    expect(PARLOR_HARNESS).toEqual({ workspace: 'parlor', package: 'harness' });
  });
});
