import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BEAR_NAME, BEAR_SYMBOL, PieceArtProvider, usePieceArt } from '../src/board/pieceArt';
import { BUG_SYMBOL, SpriteSheet } from '../src/board/sprites';

const KINDS = Object.keys(BUG_SYMBOL) as (keyof typeof BUG_SYMBOL)[];

function Probe({ onArt }: { onArt: (art: ReturnType<typeof usePieceArt>) => void }) {
  onArt(usePieceArt());
  return null;
}

describe('piece art (bear mode)', () => {
  beforeEach(() => localStorage.clear());

  it('maps all 8 pieces to distinct bear symbols that exist in the sheet', () => {
    expect(Object.keys(BEAR_SYMBOL)).toHaveLength(8);
    expect(new Set(Object.values(BEAR_SYMBOL)).size).toBe(8);
    const { container } = render(<SpriteSheet />);
    for (const kind of KINDS) {
      expect(container.querySelectorAll(`symbol#${BEAR_SYMBOL[kind]}`), kind).toHaveLength(1);
      expect(BEAR_NAME[kind], kind).toBeTruthy();
    }
  });

  it('resolves bug glyphs by default, bear glyphs when toggled, and persists', () => {
    let art!: ReturnType<typeof usePieceArt>;
    render(
      <PieceArtProvider>
        <Probe onArt={(a) => (art = a)} />
      </PieceArtProvider>,
    );
    expect(art.bearMode).toBe(false);
    expect(art.symbolFor('Q')).toBe(BUG_SYMBOL.Q);
    act(() => art.toggle());
    expect(art.bearMode).toBe(true);
    expect(art.symbolFor('Q')).toBe(BEAR_SYMBOL.Q);
    expect(localStorage.getItem('hive-piece-art')).toBe('bears');

    // a fresh provider picks the persisted choice up
    let art2!: ReturnType<typeof usePieceArt>;
    render(
      <PieceArtProvider>
        <Probe onArt={(a) => (art2 = a)} />
      </PieceArtProvider>,
    );
    expect(art2.bearMode).toBe(true);
  });
});
