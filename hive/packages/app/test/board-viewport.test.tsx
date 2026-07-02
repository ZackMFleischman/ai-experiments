import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { autoFitViewBox } from '../src/board/BoardView';
import type { ViewState } from '../src/board/BoardViewport';
import { BoardViewport, zoomViewState } from '../src/board/BoardViewport';
import { MID_GAME, replayUhp } from './replay';

const state = replayUhp(MID_GAME);

function mockRect(el: Element) {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 }) as DOMRect;
}

describe('BoardViewport pan/zoom (T3.3)', () => {
  it('background drag pans: onViewChange receives a shifted center', () => {
    const onViewChange = vi.fn();
    render(<BoardViewport board={state.board} view={null} onViewChange={onViewChange} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 300, clientY: 200, isPrimary: true });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 340, clientY: 220 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    expect(onViewChange).toHaveBeenCalled();
    const view = onViewChange.mock.lastCall?.[0] as ViewState;
    // Dragging right/down moves the view center left/up of the auto-fit center.
    const [x, , w] = autoFitViewBox(state.board).split(' ').map(Number) as [number, number, number];
    const baseCx = x + w / 2;
    expect(view.cx).toBeLessThan(baseCx);
    expect(view.zoom).toBe(1);
  });

  it('pointerdown on a tile does NOT start a pan', () => {
    const onViewChange = vi.fn();
    const { container } = render(
      <BoardViewport board={state.board} view={null} onViewChange={onViewChange} />,
    );
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    const tileCell = container.querySelector('[data-cell="0,0"]') as Element;
    fireEvent.pointerDown(tileCell, { pointerId: 1, clientX: 300, clientY: 200, isPrimary: true });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 340, clientY: 220 });
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('wheel zooms in and out around the pointer', () => {
    const onViewChange = vi.fn();
    render(<BoardViewport board={state.board} view={null} onViewChange={onViewChange} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    fireEvent.wheel(svg, { deltaY: -120, clientX: 300, clientY: 200 });
    const zoomedIn = onViewChange.mock.lastCall?.[0] as ViewState;
    expect(zoomedIn.zoom).toBeGreaterThan(1);
    fireEvent.wheel(svg, { deltaY: 120, clientX: 300, clientY: 200 });
  });

  it('zoom is clamped', () => {
    const base: ViewState = { cx: 0, cy: 0, zoom: 1 };
    expect(zoomViewState(base, 100, 0, 0).zoom).toBeLessThanOrEqual(8);
    expect(zoomViewState(base, 1 / 100, 0, 0).zoom).toBeGreaterThanOrEqual(0.25);
  });

  it('recenter button resets to auto-fit (null view)', () => {
    const onViewChange = vi.fn();
    render(
      <BoardViewport
        board={state.board}
        view={{ cx: 50, cy: 50, zoom: 2 }}
        onViewChange={onViewChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /recenter/i }));
    expect(onViewChange).toHaveBeenCalledWith(null);
  });
});
