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

  it('empty slots and disabled trays start no interaction', () => {
    const onTileTap = vi.fn();
    const { tray } = renderTray({ onTileTap, disabled: true });
    const tile = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 25, clientY: 630, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 25, clientY: 630 });
    expect(onTileTap).not.toHaveBeenCalled();
  });

  it('marks the selected slot for the tap-tap flow', () => {
    const { container } = renderTray({ selectedIndex: 1 });
    expect(
      container.querySelector('[data-rack-slot="1"]')?.getAttribute('data-selected'),
    ).toBe('true');
  });
});
