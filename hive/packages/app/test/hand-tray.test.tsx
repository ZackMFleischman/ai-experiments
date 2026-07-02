import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HandTray } from '../src/board/HandTray';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { ALL_ON } from './replay';

function fresh(): GameController {
  return new GameController(new LocalTransport(ALL_ON), ALL_ON);
}

describe('HandTray (T3.7)', () => {
  it('shows all eight bugs with counts for the side to move', () => {
    const c = fresh();
    render(<HandTray controller={c} />);
    for (const kind of ['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P']) {
      expect(screen.getByTestId(`tray-${kind}`)).toBeTruthy();
    }
    expect(screen.getByTestId('tray-count-A').textContent).toBe('3');
    expect(screen.getByTestId('tray-count-G').textContent).toBe('3');
    expect(screen.queryByTestId('tray-count-Q')).toBeNull(); // single copies show no badge
  });

  it('disables bugs with no legal placement (queen on turn 1 under tournament rule)', () => {
    const c = fresh();
    render(<HandTray controller={c} />);
    expect((screen.getByTestId('tray-Q') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('tray-S') as HTMLButtonElement).disabled).toBe(false);
  });

  it('tapping a bug selects it for placement', () => {
    const c = fresh();
    render(<HandTray controller={c} />);
    fireEvent.click(screen.getByTestId('tray-S'));
    expect(c.getSnapshot().selection?.kind).toBe('hand');
  });

  it('pointer-down starts a hand drag', () => {
    const c = fresh();
    render(<HandTray controller={c} />);
    fireEvent.pointerDown(screen.getByTestId('tray-A'), { pointerId: 5 });
    expect(c.handDragActive).toBe(true);
    expect(c.getSnapshot().selection?.kind).toBe('hand');
  });

  it('queen pulses when queen-by-4 is binding', () => {
    const c = fresh();
    const seq: Array<['hand', string] | ['cell', number, number]> = [
      ['hand', 'S'], ['cell', 0, 0],
      ['hand', 'S'], ['cell', 1, 0],
      ['hand', 'A'], ['cell', -1, 0],
      ['hand', 'A'], ['cell', 2, 0],
      ['hand', 'G'], ['cell', -2, 0],
      ['hand', 'G'], ['cell', 3, 0],
    ];
    for (const step of seq) {
      if (step[0] === 'hand') c.selectHandBug(step[1] as never);
      else c.selectCell({ q: step[1], r: step[2] });
    }
    const { container } = render(<HandTray controller={c} />);
    expect(container.querySelector('.hive-queen-pulse')).toBeTruthy();
    // and everything except the queen is disabled
    expect((screen.getByTestId('tray-A') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('tray-Q') as HTMLButtonElement).disabled).toBe(false);
  });

  it('depleted bugs render at low opacity and stay disabled', () => {
    const c = fresh();
    c.selectHandBug('M');
    c.selectCell({ q: 0, r: 0 }); // mosquito placed: white M count 0
    c.selectHandBug('S');
    c.selectCell({ q: 1, r: 0 });
    // white again — M depleted
    expect(c.getSnapshot().toMove).toBe('w');
    render(<HandTray controller={c} />);
    expect((screen.getByTestId('tray-M') as HTMLButtonElement).disabled).toBe(true);
  });
});
