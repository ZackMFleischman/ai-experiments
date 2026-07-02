import { hexToPixel } from '@hive/engine';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { snapshotToBoardUi } from '../src/board/boardUi';
import { BoardView } from '../src/board/BoardView';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { ALL_ON } from './replay';

function openedController(): GameController {
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

describe('selection affordances (T3.5)', () => {
  it('idle: movable pieces get the lift affordance, nothing dimmed', () => {
    const c = openedController();
    const ui = snapshotToBoardUi(c.getSnapshot());
    const { container } = render(<BoardView board={c.getSnapshot().state.board} ui={ui} />);
    expect(container.querySelectorAll('.hive-movable').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.hive-dimmed')).toHaveLength(0);
    expect(ui.lastMove?.to).toEqual({ q: 2, r: 0 });
  });

  it('selection: selected shadow, ghost targets, ~20% dim on the rest', () => {
    const c = openedController();
    c.selectCell({ q: -1, r: 0 });
    const snap = c.getSnapshot();
    const ui = snapshotToBoardUi(snap);
    const { container } = render(<BoardView board={snap.state.board} ui={ui} />);
    expect(container.querySelectorAll('.hive-selected')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid^="ghost-"]').length).toBe(snap.targets.size);
    expect(container.querySelectorAll('.hive-dimmed').length).toBeGreaterThan(0);
  });

  it('drag hover over a target sets hoverTarget; drag hides the lifted tile', () => {
    const c = openedController();
    c.selectCell({ q: -1, r: 0 });
    const target = [...c.getSnapshot().targets][0] as string;
    const [q, r] = target.split(',').map(Number) as [number, number];
    const { x, y } = hexToPixel({ q, r }, 40);
    c.dragTo(x, y);
    const ui = snapshotToBoardUi(c.getSnapshot());
    expect(ui.hoverTarget).toBe(target);
    expect(ui.hideTopOf).toBe('-1,0');
  });
});
