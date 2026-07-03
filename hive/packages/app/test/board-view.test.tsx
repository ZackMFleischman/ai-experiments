import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { autoFitViewBox, BoardView } from '../src/board/BoardView';
import { MID_GAME, replayUhp } from './replay';

describe('BoardView (T3.2)', () => {
  const state = replayUhp(MID_GAME);

  it('renders one tile group per tile, stacks offset by level', () => {
    const { container } = render(<BoardView board={state.board} />);
    const tiles = container.querySelectorAll('[data-tile]');
    expect(tiles).toHaveLength(6); // 6 tiles on board (wB1 climbed onto wQ)
    const stacked = container.querySelector('[data-tile="wB1"]');
    expect(stacked?.getAttribute('data-level')).toBe('1');
    expect(stacked?.getAttribute('transform')).toContain('translate(4, -6)');
  });

  it('draws bug glyphs via <use> against the sprite sheet', () => {
    const { container } = render(<BoardView board={state.board} />);
    const hrefs = [...container.querySelectorAll('[data-tile] use')].map((u) =>
      u.getAttribute('href'),
    );
    expect(hrefs).toContain('#bug-queen');
    expect(hrefs).toContain('#bug-beetle');
    expect(hrefs).toContain('#bug-spider');
  });

  it('auto-fits the viewBox around the hive', () => {
    const box = autoFitViewBox(state.board).split(' ').map(Number);
    expect(box).toHaveLength(4);
    const [minX, minY, w, h] = box as [number, number, number, number];
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    // Origin tile must lie inside.
    expect(minX).toBeLessThan(0);
    expect(minY).toBeLessThan(0);
    expect(minX + w).toBeGreaterThan(0);
    expect(minY + h).toBeGreaterThan(0);
  });

  it('marks last move, ghost targets and climb badges from ui state', () => {
    const { container } = render(
      <BoardView
        board={state.board}
        ui={{
          lastMove: { from: { q: -1, r: -1 }, to: { q: -1, r: 0 } },
          targets: new Set(['5,5']),
          climbTargets: new Set(['1,0']),
          dimOthers: true,
        }}
      />,
    );
    expect(container.querySelector('[data-testid="last-move-from"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ghost-5,5"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="climb-1,0"]')).toBeTruthy();
    expect(container.querySelectorAll('.hive-dimmed').length).toBeGreaterThan(0);
  });

  it('hides the top of a lifted stack', () => {
    const { container } = render(<BoardView board={state.board} ui={{ hideTopOf: '-1,0' }} />);
    // wB1 sits on wQ at -1,0; lifted → only the queen remains visible there.
    const cell = container.querySelector('[data-cell="-1,0"]');
    expect(cell?.querySelectorAll('[data-tile]')).toHaveLength(1);
    expect(cell?.querySelector('[data-tile="wB1"]')).toBeNull();
  });
});
