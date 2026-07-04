// T0.3 seed: proves vitest is wired in @lex/dict. Real dictionary tests land
// with M2.
import { describe, expect, it } from 'vitest';
import type { DictionaryInfo } from '../src/index.js';

describe('@lex/dict seed', () => {
  it('exposes the DictionaryInfo placeholder shape', () => {
    const info: DictionaryInfo = {
      id: 'enable1',
      name: 'Tournament-style',
      description: 'ENABLE word list',
      wordCount: 0,
    };
    expect(info.id).toBe('enable1');
  });
});
