// T3.3 gate: rack tray — rackSize slots, tiles with point indices, blanks,
// drag-reorder via raw pointer events, shuffle, bag-count chip, tap + drag-out
// seams for the controller/drag layer.
import { fireEvent, render, screen } from '@testing-library/react';
import { RULESETS } from '@lex/engine';
import { describe, expect, it, vi } from 'vitest';
import { RackTray } from '../src/board/RackTray';

const classic = RULESETS['classic']!;

function mockRect(el: Element, left = 0, top = 600, width = 350, height = 60) {
  el.getBoundingClientRect = () =>
    ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
}

function renderTray(overrides: Partial<Parameters<typeof RackTray>[0]> = {}) {
  const props = {
    tiles: ['A', 'E', 'I', '?', 'Q', null, null] as ReadonlyArray<string | null>,
    rackSize: classic.rackSize,
    points: classic.tiles.points,
    bagCount: 86,
    ...overrides,
  };
  const result = render(<RackTray {...props} />);
  const tray = screen.getByTestId('rack-tray');
  mockRect(tray);
  return { ...result, tray };
}

describe('RackTray', () => {
  it('renders rackSize slots — nothing hard-codes 7', () => {
    const { container } = renderTray({ tiles: ['A', null, null, null, null], rackSize: 5 });
    expect(container.querySelectorAll('[data-rack-slot]')).toHaveLength(5);
  });

  it('renders tiles with letters and point indices; empty slots stay empty', () => {
    const { container } = renderTray();
    const slot0 = container.querySelector('[data-rack-slot="0"]');
    expect(slot0?.textContent).toContain('A');
    expect(slot0?.textContent).toContain('1');
    const q = container.querySelector('[data-rack-slot="4"]');
    expect(q?.textContent).toContain(String(classic.tiles.points['Q']));
    expect(container.querySelector('[data-rack-slot="5"] [data-tile]')).toBeFalsy();
  });

  it('renders a blank as a faceless tile (no letter, no point index)', () => {
    const { container } = renderTray();
    const blank = container.querySelector('[data-rack-slot="3"] [data-tile]');
    expect(blank?.getAttribute('data-blank')).toBe('true');
    expect(blank?.textContent?.trim()).toBe('');
  });

  it('shows the bag count chip', () => {
    renderTray();
    expect(screen.getByTestId('bag-count').textContent).toContain('86');
  });

  it('shuffle button fires onShuffle', () => {
    const onShuffle = vi.fn();
    renderTray({ onShuffle });
    fireEvent.click(screen.getByRole('button', { name: /shuffle/i }));
    expect(onShuffle).toHaveBeenCalledOnce();
  });

  it('a motionless press on a tile is a tap', () => {
    const onTileTap = vi.fn();
    const { tray } = renderTray({ onTileTap });
    const tile = tray.querySelector('[data-rack-slot="1"]') as Element;
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 75, clientY: 630, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 75, clientY: 630 });
    expect(onTileTap).toHaveBeenCalledWith(1);
  });

  it('horizontal drag reorders: slot 0 dragged past slot 2 → onReorder(0, 2)', () => {
    const onReorder = vi.fn();
    const onTileTap = vi.fn();
    const { tray } = renderTray({ onReorder, onTileTap });
    const tile = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 25, clientY: 630, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 1, clientX: 125, clientY: 632 });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 125, clientY: 632 });
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(onTileTap).not.toHaveBeenCalled();
  });

  it('dragging out of the tray hands the pointer to the drag layer', () => {
    const onDragOut = vi.fn();
    const onReorder = vi.fn();
    const { tray } = renderTray({ onDragOut, onReorder });
    const tile = tray.querySelector('[data-rack-slot="2"]') as Element;
    fireEvent.pointerDown(tile, { pointerId: 7, clientX: 125, clientY: 630, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 7, clientX: 130, clientY: 500 });
    expect(onDragOut).toHaveBeenCalled();
    const [index, pointerId] = onDragOut.mock.calls[0] as [number, number];
    expect(index).toBe(2);
    expect(pointerId).toBe(7);
    // The tray must not also treat the release as a reorder.
    fireEvent.pointerUp(tray, { pointerId: 7, clientX: 130, clientY: 480 });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('forgets a handed-off pointer immediately — the next drag works without a tray pointerup', () => {
    // Regression (T3.13): after onDragOut, the pointerup lands outside the
    // tray and never reaches it; a wedged drag ref killed all later drags.
    const onDragOut = vi.fn();
    const onTileTap = vi.fn();
    const { tray } = renderTray({ onDragOut, onTileTap });
    const first = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(first, { pointerId: 1, clientX: 25, clientY: 630, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 1, clientX: 30, clientY: 500 });
    expect(onDragOut).toHaveBeenCalledOnce();
    // No pointerup on the tray (it landed on the board). Next interaction:
    const second = tray.querySelector('[data-rack-slot="1"]') as Element;
    fireEvent.pointerDown(second, { pointerId: 2, clientX: 75, clientY: 630, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 2, clientX: 80, clientY: 500 });
    expect(onDragOut).toHaveBeenCalledTimes(2);
  });

  it('empty slots and disabled trays start no interaction', () => {
    const onTileTap = vi.fn();
    const { tray } = renderTray({ onTileTap, disabled: true });
    const tile = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 25, clientY: 630, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 25, clientY: 630 });
    expect(onTileTap).not.toHaveBeenCalled();
  });

  it('rearrangeOnly (off-turn): reorder and shuffle work, tap and drag-out are suppressed', () => {
    const onReorder = vi.fn();
    const onShuffle = vi.fn();
    const onTileTap = vi.fn();
    const onDragOut = vi.fn();
    const { tray } = renderTray({ rearrangeOnly: true, onReorder, onShuffle, onTileTap, onDragOut });

    // Shuffle still fires — planning your next hand off-turn.
    fireEvent.click(screen.getByRole('button', { name: /shuffle/i }));
    expect(onShuffle).toHaveBeenCalledOnce();

    // A horizontal drag still reorders.
    const tile = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 25, clientY: 630, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 1, clientX: 125, clientY: 632 });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 125, clientY: 632 });
    expect(onReorder).toHaveBeenCalledWith(0, 2);

    // A motionless press does NOT arm a tile (nothing to place off-turn).
    const tapTile = tray.querySelector('[data-rack-slot="1"]') as Element;
    fireEvent.pointerDown(tapTile, { pointerId: 2, clientX: 75, clientY: 630, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 2, clientX: 75, clientY: 630 });
    expect(onTileTap).not.toHaveBeenCalled();

    // Dragging upward off the tray does NOT hand off to the board.
    const outTile = tray.querySelector('[data-rack-slot="2"]') as Element;
    fireEvent.pointerDown(outTile, { pointerId: 3, clientX: 125, clientY: 630, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 3, clientX: 130, clientY: 500 });
    expect(onDragOut).not.toHaveBeenCalled();
  });

  it('marks the selected slot for the tap-tap flow', () => {
    const { container } = renderTray({ selectedIndex: 1 });
    expect(
      container.querySelector('[data-rack-slot="1"]')?.getAttribute('data-selected'),
    ).toBe('true');
  });

  it('a press anywhere on the tray grabs the nearest tile — no pixel-perfect aim needed', () => {
    // Real-device polish: missing the 44px slot used to fall through to the
    // board viewport, which panned the board instead. The whole tray is now
    // the hit target; the slot is derived from the x position.
    const onReorder = vi.fn();
    const { tray } = renderTray({ onReorder });
    // pointerDown on the TRAY itself (not a slot child), over slot 0's x-range.
    fireEvent.pointerDown(tray, { pointerId: 3, clientX: 25, clientY: 630, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 3, clientX: 125, clientY: 632 });
    fireEvent.pointerUp(tray, { pointerId: 3, clientX: 125, clientY: 632 });
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it('the shuffle button and bag chip never start a fat-target drag', () => {
    const onReorder = vi.fn();
    const onTileTap = vi.fn();
    renderTray({ onReorder, onTileTap });
    const shuffle = screen.getByRole('button', { name: /shuffle/i });
    fireEvent.pointerDown(shuffle, { pointerId: 4, clientX: 330, clientY: 630, isPrimary: true });
    fireEvent.pointerUp(shuffle, { pointerId: 4, clientX: 330, clientY: 630 });
    const bag = screen.getByTestId('bag-count');
    fireEvent.pointerDown(bag, { pointerId: 5, clientX: 335, clientY: 645, isPrimary: true });
    fireEvent.pointerUp(bag, { pointerId: 5, clientX: 335, clientY: 645 });
    expect(onReorder).not.toHaveBeenCalled();
    expect(onTileTap).not.toHaveBeenCalled();
  });

  it('neighbors shift out of the way in real time while a tile is dragged', () => {
    const { tray } = renderTray();
    const tile = tray.querySelector('[data-rack-slot="0"]') as HTMLElement;
    fireEvent.pointerDown(tile, { pointerId: 6, clientX: 25, clientY: 630, isPrimary: true });
    // Mocked tray is 350px wide → slotWidth 50. Dragged +100px = two slots.
    fireEvent.pointerMove(tray, { pointerId: 6, clientX: 125, clientY: 631 });
    const slot = (i: number) => tray.querySelector(`[data-rack-slot="${i}"]`) as HTMLElement;
    expect(slot(0).style.transform).toBe('translateX(100px)');
    expect(slot(1).style.transform).toBe('translateX(-50px)');
    expect(slot(2).style.transform).toBe('translateX(-50px)');
    expect(slot(3).style.transform).toBe('');
    // Release: previews clear.
    fireEvent.pointerUp(tray, { pointerId: 6, clientX: 125, clientY: 631 });
    expect(slot(1).style.transform).toBe('');
  });

  it('slides slots for an external drag-layer preview (ghost hovering the tray)', () => {
    // The preview prop arrives mid-drag, after mount — as in the real app.
    const props = {
      tiles: ['A', 'E', 'I', '?', 'Q', null, null] as ReadonlyArray<string | null>,
      rackSize: classic.rackSize,
      points: classic.tiles.points,
      bagCount: 86,
    };
    const { rerender } = render(<RackTray {...props} />);
    const tray = screen.getByTestId('rack-tray');
    mockRect(tray);
    rerender(<RackTray {...props} externalDrag={{ from: 0, to: 2 }} />);
    const slot = (i: number) => tray.querySelector(`[data-rack-slot="${i}"]`) as HTMLElement;
    expect(slot(1).style.transform).toBe('translateX(-50px)');
    expect(slot(2).style.transform).toBe('translateX(-50px)');
    expect(slot(3).style.transform).toBe('');
  });
});
