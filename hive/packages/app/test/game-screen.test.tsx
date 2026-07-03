import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { GameScreen } from '../src/game/GameScreen';
import { queenLiberties } from '../src/game/PlayerBar';
import { ALL_ON } from './replay';

function opened(): GameController {
  const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
  const taps: Array<['hand', string] | ['cell', number, number]> = [
    ['hand', 'S'], ['cell', 0, 0],
    ['hand', 'S'], ['cell', 1, 0],
    ['hand', 'Q'], ['cell', -1, 0],
    ['hand', 'Q'], ['cell', 2, 0],
  ];
  for (const t of taps) {
    if (t[0] === 'hand') c.selectHandBug(t[1] as never);
    else c.selectCell({ q: t[1], r: t[2] });
  }
  return c;
}

function renderScreen(c: GameController) {
  return render(
    <MemoryRouter>
      <GameScreen controller={c} staticMode />
    </MemoryRouter>,
  );
}

describe('game screen chrome (T3.8)', () => {
  it('shows both player bars with queen liberties and the active turn', () => {
    const c = opened();
    renderScreen(c);
    expect(screen.getByTestId('player-bar-w').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('player-bar-b').getAttribute('data-active')).toBeNull();
    // wQ at -1,0 touches wS1 only → 5 liberties; bQ likewise.
    expect(queenLiberties(c.getSnapshot(), 'w')).toBe(5);
    expect(screen.getByTestId('liberties-w').textContent).toContain('5');
  });

  it('move list drawer lists UHP moves in order', () => {
    const c = opened();
    renderScreen(c);
    fireEvent.click(screen.getByRole('button', { name: /move list/i }));
    const rows = screen.getAllByTestId('move-row');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain('wS1');
  });

  it('resign flows through the confirm dialog and ends the game', () => {
    const c = opened();
    renderScreen(c);
    fireEvent.click(screen.getByRole('button', { name: /game menu/i }));
    fireEvent.click(screen.getByText('Resign'));
    fireEvent.click(screen.getByTestId('confirm-action'));
    expect(c.getSnapshot().end).toEqual({ by: 'resign', winner: 'b' });
    expect(screen.getByTestId('result-overlay')).toBeTruthy();
  });

  it('draw offer surfaces the hot-seat response dialog; accept ends in a draw', () => {
    const c = opened();
    renderScreen(c);
    fireEvent.click(screen.getByRole('button', { name: /game menu/i }));
    fireEvent.click(screen.getByText('Offer draw'));
    fireEvent.click(screen.getByTestId('confirm-action'));
    fireEvent.click(screen.getByTestId('draw-accept'));
    expect(c.getSnapshot().end).toEqual({ by: 'draw-agreed' });
  });

  it('meta events appear in the move list', () => {
    const c = opened();
    c.offerDraw('w');
    c.respondDraw('b', false);
    renderScreen(c);
    fireEvent.click(screen.getByRole('button', { name: /move list/i }));
    const metas = screen.getAllByTestId('meta-row');
    expect(metas.map((m) => m.textContent)).toEqual([
      'White offered a draw',
      'Black declined the draw',
    ]);
  });
});

describe('end of game (T3.9)', () => {
  it('resignation opens the overlay with the right headline and stats', () => {
    const c = opened();
    c.resign('b');
    renderScreen(c);
    const overlay = screen.getByTestId('result-overlay');
    expect(within(overlay).getByText('Black resigned')).toBeTruthy();
    expect(within(overlay).getByText('White wins')).toBeTruthy();
    expect(within(overlay).getByTestId('result-stats').textContent).toContain('4 moves');
  });

  it('view board dismisses to the persistent banner; summary reopens', () => {
    const c = opened();
    c.resign('b');
    renderScreen(c);
    fireEvent.click(screen.getByTestId('overlay-view-board'));
    expect(c.getSnapshot().overlayOpen).toBe(false);
    expect(screen.getByTestId('result-banner')).toBeTruthy();
    fireEvent.click(screen.getByText('Summary'));
    expect(c.getSnapshot().overlayOpen).toBe(true);
  });

  it('new game from the overlay resets the session', async () => {
    const c = opened();
    c.resign('b');
    renderScreen(c);
    fireEvent.click(screen.getByTestId('overlay-new-game'));
    await Promise.resolve();
    expect(c.getSnapshot().state.board.size).toBe(0);
    expect(c.getSnapshot().end).toBeUndefined();
  });
});
