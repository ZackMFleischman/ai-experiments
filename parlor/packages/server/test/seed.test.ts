// T0.3 seed: proves vitest is wired in @parlor/server. Real tests land with
// the porting tasks (lex T4.4).
import { describe, expect, it } from 'vitest';
import { PARLOR_SERVER } from '../src/index.js';

describe('@parlor/server seed', () => {
  it('exposes the wiring probe', () => {
    expect(PARLOR_SERVER).toEqual({ workspace: 'parlor', package: 'server' });
  });
});
