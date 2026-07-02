import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALL_SYMBOLS, BUG_SYMBOL, SpriteSheet } from '../src/board/sprites';

describe('sprite sheet (T3.1)', () => {
  it('defines every symbol exactly once, all bugs covered', () => {
    const { container } = render(<SpriteSheet />);
    for (const id of ALL_SYMBOLS) {
      expect(container.querySelectorAll(`symbol#${id}`), id).toHaveLength(1);
    }
    expect(Object.keys(BUG_SYMBOL)).toHaveLength(8);
  });

  it('glyphs draw with currentColor and tiles with the CSS variable', () => {
    const { container } = render(<SpriteSheet />);
    for (const id of Object.values(BUG_SYMBOL)) {
      const symbol = container.querySelector(`symbol#${id}`);
      expect(symbol?.innerHTML, id).toContain('currentColor');
    }
    const base = container.querySelector('symbol#hex-base polygon');
    expect(base?.getAttribute('fill')).toContain('var(--hive-tile');
  });
});
