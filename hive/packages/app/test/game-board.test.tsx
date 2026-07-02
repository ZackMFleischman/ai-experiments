import { hexToPixel } from '@hive/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameBoard } from '../src/board/GameBoard';
import { HEX_SIZE } from '../src/board/hexGeometry';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { ALL_ON } from './replay';

// The svg mock rect is 600x400; auto-fit viewBox varies, so tests locate cells
// via their data attributes and drive the controller through pointer events on
// those elements, with client coords derived from board coords by the inverse
// of BoardViewport's mapping (identity checks are covered at controller level —
// here we assert the event ROUTING).
function mockRect(el: Element) {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 }) as DOMRect;
}

function opened(): GameController {
  const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
  c.selectHandBug('S');
  c.selectCell({ q: 0, r: 0 });
  c.selectHandBug('S');
  c.selectCell({ q: 1, r: 0 });
  c.selectHandBug('Q');
  c.selectCell({ q: -1, r: 0 });
  c.selectHandBug('Q');
  c.selectCell({ q: 2, r: 0 });
  return c;
}

describe('GameBoard drag layer (T3.6)', () => {
  let c: GameController;
  beforeEach(() => {
    c = opened();
  });

  it('pointer-down on an own piece selects it (instant lift)', () => {
    const { container } = render(<GameBoard controller={c} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    const cell = container.querySelector('[data-cell="-1,0"]') as Element;
    fireEvent.pointerDown(cell, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(c.getSnapshot().selection?.kind).toBe('board');
  });

  it('tap-tap: releasing on a ghost target commits the move', () => {
    const { container } = render(<GameBoard controller={c} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    fireEvent.pointerDown(container.querySelector('[data-cell="-1,0"]') as Element, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    const target = [...c.getSnapshot().targets][0] as string;
    const ghost = container.querySelector(`[data-testid="ghost-${target}"]`) as Element;
    fireEvent.pointerDown(ghost, { pointerId: 2, clientX: 120, clientY: 120 });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 120, clientY: 120 });
    const s = c.getSnapshot();
    expect(s.state.board.has(target)).toBe(true);
    expect(s.toMove).toBe('b');
  });

  it('a real drag shows the snap preview and drops on the hovered target', () => {
    const { container } = render(<GameBoard controller={c} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    fireEvent.pointerDown(container.querySelector('[data-cell="-1,0"]') as Element, {
      pointerId: 1,
      clientX: 300,
      clientY: 200,
    });
    // Move far enough to pass the threshold; the exact board point matters only
    // to the controller, which we then verify by dropping onto a known target.
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 360, clientY: 260 });
    expect(c.getSnapshot().drag).toBeTruthy();
    expect(screen.getByTestId('drag-preview')).toBeTruthy();
    // Drive the drop through the controller's target set to stay viewport-agnostic.
    const target = [...c.getSnapshot().targets][0] as string;
    const [q, r] = target.split(',').map(Number) as [number, number];
    const pt = hexToPixel({ q, r }, HEX_SIZE);
    c.drop(pt.x, pt.y);
    expect(c.getSnapshot().state.board.has(target)).toBe(true);
  });

  it('Escape cancels the drag', () => {
    const { container } = render(<GameBoard controller={c} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    fireEvent.pointerDown(container.querySelector('[data-cell="-1,0"]') as Element, {
      pointerId: 1,
      clientX: 300,
      clientY: 200,
    });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 340, clientY: 240 });
    fireEvent.keyDown(window, { key: 'Escape' });
    const s = c.getSnapshot();
    expect(s.selection).toBeUndefined();
    expect(s.drag).toBeUndefined();
  });

  it('background tap cancels a selection', () => {
    render(<GameBoard controller={c} />);
    const svg = screen.getByTestId('board-view');
    mockRect(svg);
    c.selectCell({ q: -1, r: 0 });
    expect(c.getSnapshot().selection).toBeTruthy();
    fireEvent.pointerDown(svg, { pointerId: 3, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(svg, { pointerId: 3, clientX: 20, clientY: 20 });
    expect(c.getSnapshot().selection).toBeUndefined();
  });

  it('not-allowed preview over invalid cells', () => {
    render(<GameBoard controller={c} />);
    c.selectCell({ q: -1, r: 0 });
    const far = hexToPixel({ q: 9, r: 9 }, HEX_SIZE);
    c.dragTo(far.x, far.y);
    render(<GameBoard controller={c} />);
    const previews = screen.getAllByTestId('drag-preview');
    expect(previews[previews.length - 1]?.getAttribute('data-allowed')).toBe('false');
  });
});
