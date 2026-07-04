// T3.1 gate: grid board renders from BoardLayout (premium colors + labels,
// star, committed tiles with letter + point index) with nothing hard-coded.
import { render, screen } from '@testing-library/react';
import { RULESETS, cellKey, type BoardLayout, type CellKey, type PlacedTile } from '@lex/engine';
import { describe, expect, it } from 'vitest';
import { BoardGrid } from '../src/board/BoardGrid';

const classic = RULESETS['classic']!;
const modern = RULESETS['modern']!;

function renderBoard(
  layout: BoardLayout,
  tiles: ReadonlyMap<CellKey, PlacedTile> = new Map(),
) {
  return render(<BoardGrid layout={layout} points={classic.tiles.points} tiles={tiles} />);
}

function premiumCensus(layout: BoardLayout): Record<string, number> {
  const census: Record<string, number> = {};
  for (const premium of Object.values(layout.premiums)) {
    census[premium] = (census[premium] ?? 0) + 1;
  }
  return census;
}

describe('BoardGrid', () => {
  it('renders rows × cols cells from the layout (classic 15×15)', () => {
    const { container } = renderBoard(classic.board);
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(
      classic.board.rows * classic.board.cols,
    );
  });

  it('renders arbitrary board dimensions — nothing is hard-coded to 15', () => {
    const tiny: BoardLayout = {
      id: 'tiny',
      rows: 5,
      cols: 7,
      premiums: { '0,0': 'TW', '2,3': 'DL' },
      start: { row: 2, col: 3 },
    };
    const { container } = renderBoard(tiny);
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(35);
    expect(container.querySelector('[data-cell="0,0"]')?.getAttribute('data-premium')).toBe('TW');
  });

  for (const board of [classic.board, modern.board]) {
    it(`labels every premium cell on ${board.id} (color is never the only signal)`, () => {
      const { container } = renderBoard(board);
      const census = premiumCensus(board);
      for (const premium of ['DL', 'TL', 'DW', 'TW'] as const) {
        const cells = container.querySelectorAll(`[data-premium="${premium}"]`);
        expect(cells, premium).toHaveLength(census[premium] ?? 0);
        for (const cell of cells) {
          // The start cell shows the star instead of a text label.
          if (cell.getAttribute('data-cell') === cellKey(board.start)) continue;
          expect(cell.textContent, `${premium} label`).toContain(premium);
        }
      }
    });
  }

  it('marks the start cell with a star, not a text label', () => {
    const { container } = renderBoard(classic.board);
    const start = container.querySelector(`[data-cell="${cellKey(classic.board.start)}"]`);
    expect(start?.querySelector('[data-star]')).toBeTruthy();
    expect(start?.textContent).not.toContain('DW');
  });

  it('renders a committed tile with its letter and point index from the ruleset data', () => {
    const tiles = new Map<CellKey, PlacedTile>([
      ['7,7', { letter: 'Q', isBlank: false }],
      ['7,8', { letter: 'A', isBlank: false }],
    ]);
    const { container } = renderBoard(classic.board, tiles);
    const q = container.querySelector('[data-cell="7,7"] [data-tile]');
    expect(q?.getAttribute('data-tile')).toBe('Q');
    expect(q?.textContent).toContain('Q');
    expect(q?.textContent).toContain(String(classic.tiles.points['Q']));
    const a = container.querySelector('[data-cell="7,8"] [data-tile]');
    expect(a?.textContent).toContain('1');
  });

  it('renders a blank tile with its designated letter and no point index', () => {
    const tiles = new Map<CellKey, PlacedTile>([['7,7', { letter: 'Z', isBlank: true }]]);
    const { container } = renderBoard(classic.board, tiles);
    const tile = container.querySelector('[data-cell="7,7"] [data-tile]');
    expect(tile?.getAttribute('data-blank')).toBe('true');
    expect(tile?.textContent).toContain('Z');
    // Z is 10 points — a blank must not show it.
    expect(tile?.textContent).not.toContain('10');
  });

  it('a committed tile covers the premium label and the star', () => {
    const startKey = cellKey(classic.board.start);
    const tiles = new Map<CellKey, PlacedTile>([
      [startKey, { letter: 'C', isBlank: false }],
      ['0,0', { letter: 'T', isBlank: false }], // TW corner
    ]);
    const { container } = renderBoard(classic.board, tiles);
    const start = container.querySelector(`[data-cell="${startKey}"]`);
    expect(start?.querySelector('[data-star]')).toBeFalsy();
    const corner = container.querySelector('[data-cell="0,0"]');
    expect(corner?.textContent).not.toContain('TW');
  });

  it('exposes the grid to assistive tech and e2e with row/col addressing', () => {
    render(
      <BoardGrid layout={classic.board} points={classic.tiles.points} tiles={new Map()} />,
    );
    expect(screen.getByRole('grid', { name: /board/i })).toBeTruthy();
  });
});
