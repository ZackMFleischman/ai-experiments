// T3.2 gate: pan / pinch / wheel / double-tap / recenter over the CSS-transform
// viewport, plus the interaction routing seam the drag layer (T3.5) plugs into.
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardInteraction, BoardViewportHandle, ViewState } from '../src/board/BoardViewport';
import { BoardViewport, fitScale, viewTransform, zoomViewState } from '../src/board/BoardViewport';

const BOARD = { width: 544, height: 544 }; // 15 × 36px + padding

function mockRect(el: Element, width = 600, height = 400) {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height }) as DOMRect;
}

function renderViewport(props: {
  view?: ViewState | null;
  onViewChange?: (v: ViewState | null) => void;
  interaction?: BoardInteraction;
  handleRef?: React.Ref<BoardViewportHandle>;
}) {
  const result = render(
    <BoardViewport
      boardWidth={BOARD.width}
      boardHeight={BOARD.height}
      view={props.view ?? null}
      onViewChange={props.onViewChange ?? (() => {})}
      {...(props.interaction ? { interaction: props.interaction } : {})}
      {...(props.handleRef ? { handleRef: props.handleRef } : {})}
    >
      <div data-cell="7,7">
        <div data-pending="true" data-tile="A" />
      </div>
      <div data-cell="0,0" />
    </BoardViewport>,
  );
  const container = screen.getByTestId('board-viewport');
  mockRect(container);
  return { ...result, container };
}

function makeInteraction(): BoardInteraction {
  return {
    onPendingDown: vi.fn(),
    onDragMove: vi.fn(),
    onDragEnd: vi.fn(),
    onCellTap: vi.fn(),
    onBackgroundTap: vi.fn(),
  };
}

describe('view math', () => {
  it('zoomViewState clamps and keeps the point under the pointer fixed', () => {
    const base: ViewState = { cx: 100, cy: 100, zoom: 1 };
    expect(zoomViewState(base, 100, 0, 0).zoom).toBeLessThanOrEqual(8);
    expect(zoomViewState(base, 1 / 100, 0, 0).zoom).toBeGreaterThanOrEqual(0.25);
    // Zooming ×2 at the view center leaves the center fixed.
    const zoomed = zoomViewState(base, 2, 100, 100);
    expect(zoomed.cx).toBeCloseTo(100);
    expect(zoomed.cy).toBeCloseTo(100);
  });

  it('fitScale fits the whole board in the container', () => {
    expect(fitScale(600, 400, BOARD.width, BOARD.height)).toBeCloseTo(400 / 544);
    // Phone width: 15 cols ≈ 25px cells (DESIGN §7.2).
    const phone = fitScale(390, 844, BOARD.width, BOARD.height);
    expect(36 * phone).toBeGreaterThan(23);
    expect(36 * phone).toBeLessThan(27);
  });

  it('viewTransform centers the view point in the container', () => {
    const t = viewTransform(600, 400, BOARD.width, BOARD.height, {
      cx: BOARD.width / 2,
      cy: BOARD.height / 2,
      zoom: 1,
    });
    // Board center lands at container center under the transform.
    expect(t.scale * (BOARD.width / 2) + t.tx).toBeCloseTo(300);
    expect(t.scale * (BOARD.height / 2) + t.ty).toBeCloseTo(200);
  });
});

describe('BoardViewport interaction', () => {
  it('background drag pans: view center shifts opposite the drag', () => {
    const onViewChange = vi.fn();
    const { container } = renderViewport({ onViewChange });
    fireEvent.pointerDown(container, { pointerId: 1, clientX: 300, clientY: 200, isPrimary: true });
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 340, clientY: 220 });
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 340, clientY: 220 });
    expect(onViewChange).toHaveBeenCalled();
    const view = onViewChange.mock.lastCall?.[0] as ViewState;
    expect(view.cx).toBeLessThan(BOARD.width / 2);
    expect(view.zoom).toBe(1);
  });

  it('pointerdown on a pending tile routes to the drag layer, not the pan', () => {
    const onViewChange = vi.fn();
    const interaction = makeInteraction();
    const { container } = renderViewport({ onViewChange, interaction });
    const pending = container.querySelector('[data-pending="true"]') as Element;
    fireEvent.pointerDown(pending, { pointerId: 1, clientX: 300, clientY: 200, isPrimary: true });
    expect(interaction.onPendingDown).toHaveBeenCalledOnce();
    const [cell] = (interaction.onPendingDown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { row: number; col: number },
    ];
    expect(cell).toEqual({ row: 7, col: 7 });
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 340, clientY: 220 });
    expect(interaction.onDragMove).toHaveBeenCalled();
    expect(onViewChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 340, clientY: 220 });
    expect(interaction.onDragEnd).toHaveBeenCalled();
  });

  it('a motionless press on a cell is a cell tap; off the board, a background tap', () => {
    const interaction = makeInteraction();
    const { container } = renderViewport({ interaction });
    const cell = container.querySelector('[data-cell="0,0"]') as Element;
    fireEvent.pointerDown(cell, { pointerId: 1, clientX: 10, clientY: 10, isPrimary: true });
    fireEvent.pointerUp(cell, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(interaction.onCellTap).toHaveBeenCalledWith({ row: 0, col: 0 });
    fireEvent.pointerDown(container, { pointerId: 2, clientX: 590, clientY: 390, isPrimary: true });
    fireEvent.pointerUp(container, { pointerId: 2, clientX: 590, clientY: 390 });
    expect(interaction.onBackgroundTap).toHaveBeenCalledOnce();
  });

  it('wheel zooms around the pointer', () => {
    const onViewChange = vi.fn();
    const { container } = renderViewport({ onViewChange });
    fireEvent.wheel(container, { deltaY: -120, clientX: 300, clientY: 200 });
    const view = onViewChange.mock.lastCall?.[0] as ViewState;
    expect(view.zoom).toBeGreaterThan(1);
  });

  it('pinch with two pointers zooms', () => {
    const onViewChange = vi.fn();
    const { container } = renderViewport({ onViewChange });
    fireEvent.pointerDown(container, { pointerId: 1, clientX: 280, clientY: 200, isPrimary: true });
    fireEvent.pointerDown(container, { pointerId: 2, clientX: 320, clientY: 200 });
    fireEvent.pointerMove(container, { pointerId: 2, clientX: 380, clientY: 200 });
    const view = onViewChange.mock.lastCall?.[0] as ViewState;
    expect(view.zoom).toBeGreaterThan(1);
  });

  it('double-tap zooms to placement scale at the tap; a second double-tap refits', () => {
    const onViewChange = vi.fn();
    const interaction = makeInteraction();
    const { container, rerender } = renderViewport({ onViewChange, interaction });
    const tap = (id: number) => {
      fireEvent.pointerDown(container, { pointerId: id, clientX: 300, clientY: 200, isPrimary: true });
      fireEvent.pointerUp(container, { pointerId: id, clientX: 300, clientY: 200 });
    };
    tap(1);
    tap(2);
    const view = onViewChange.mock.lastCall?.[0] as ViewState;
    expect(view.zoom).toBeGreaterThan(1);
    // Once zoomed in, double-tap returns to fit (null view).
    rerender(
      <BoardViewport
        boardWidth={BOARD.width}
        boardHeight={BOARD.height}
        view={view}
        onViewChange={onViewChange}
        interaction={interaction}
      >
        <div />
      </BoardViewport>,
    );
    tap(3);
    tap(4);
    expect(onViewChange.mock.lastCall?.[0]).toBeNull();
  });

  it('recenter button resets to auto-fit (null view)', () => {
    const onViewChange = vi.fn();
    renderViewport({ view: { cx: 50, cy: 50, zoom: 2 }, onViewChange });
    fireEvent.click(screen.getByRole('button', { name: /recenter/i }));
    expect(onViewChange).toHaveBeenCalledWith(null);
  });

  it('toBoardPoint maps the container center to the view center', () => {
    const handleRef = createRef<BoardViewportHandle>();
    renderViewport({ handleRef });
    const pt = handleRef.current?.toBoardPoint(300, 200);
    expect(pt?.x).toBeCloseTo(BOARD.width / 2);
    expect(pt?.y).toBeCloseTo(BOARD.height / 2);
  });
});
