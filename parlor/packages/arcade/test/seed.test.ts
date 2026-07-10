import { describe, expect, it } from 'vitest';
import { PARLOR_ARCADE } from '../src/index.js';

describe('wiring probe', () => {
  it('identifies the package', () => {
    expect(PARLOR_ARCADE).toEqual({ workspace: 'parlor', package: 'arcade' });
  });
});
