// T0.3 seed: proves vitest is wired in @parlor/web. Real tests land with the
// porting tasks (lex T4.1).
import { describe, expect, it } from 'vitest';
import { PARLOR_WEB } from '../src/index.js';

describe('@parlor/web seed', () => {
  it('exposes the wiring probe', () => {
    expect(PARLOR_WEB).toEqual({ workspace: 'parlor', package: 'web' });
  });
});
