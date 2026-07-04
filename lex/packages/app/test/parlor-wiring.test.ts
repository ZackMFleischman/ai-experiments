// T0.1: proves the cross-workspace source-link wiring (IMPLEMENTATION.md §1) —
// a lex package importing @parlor/* TS source from the sibling parlor/
// workspace, through both pnpm `link:` resolution and the tsconfig paths map.
import { describe, expect, it } from 'vitest';
import { PARLOR_CORE } from '@parlor/core';
import { PARLOR_WEB } from '@parlor/web';

describe('parlor source-link wiring (T0.1)', () => {
  it('imports @parlor/core source across workspace roots', () => {
    expect(PARLOR_CORE.workspace).toBe('parlor');
    expect(PARLOR_CORE.package).toBe('core');
  });

  it('imports @parlor/web source across workspace roots', () => {
    expect(PARLOR_WEB.package).toBe('web');
  });
});
