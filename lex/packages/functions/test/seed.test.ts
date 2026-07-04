// T0.3 seed: proves vitest is wired in @lex/functions. Emulator-backed tests
// land with T0.5.
import { describe, expect, it } from 'vitest';
import { LEX_FUNCTIONS } from '../src/index.js';

describe('@lex/functions seed', () => {
  it('imports the package entry', () => {
    expect(LEX_FUNCTIONS.package).toBe('functions');
  });
});
