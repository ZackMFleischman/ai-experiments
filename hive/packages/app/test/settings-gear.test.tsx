// The in-game settings gear surfaces Bear mode + Confirm move, and the
// Confirm-move bar only appears when the setting is on (disabled until a move
// is staged, enabled once one is). Renders the real game chrome.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders, AppRoutes } from '../src/App';
import { GameScreen } from '../src/game/GameScreen';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { ALL_ON } from './replay';

afterEach(() => {
  localStorage.clear();
});

function renderGameRoute() {
  return render(
    <MemoryRouter initialEntries={['/game/local']}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('in-game settings gear', () => {
  it('opens the gear popover with Bear mode and Confirm move toggles', async () => {
    renderGameRoute();
    await screen.findByTestId('hand-tray');
    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));
    expect(await screen.findByRole('checkbox', { name: /bear mode/i })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /confirm move/i })).toBeTruthy();
  });

  it('confirm-move button is absent by default and appears (disabled) when enabled', async () => {
    renderGameRoute();
    await screen.findByTestId('hand-tray');
    expect(screen.queryByTestId('confirm-move')).toBeNull(); // off by default

    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /confirm move/i }));

    const confirm = (await screen.findByTestId('confirm-move')) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // nothing staged yet
  });

  it('bear mode reskins the pieces from the gear', async () => {
    const { container } = renderGameRoute();
    await screen.findByTestId('hand-tray');
    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /bear mode/i }));
    await waitFor(() => {
      expect(container.querySelector('use[href="#bear-ant"]')).toBeTruthy();
      expect(container.querySelector('use[href="#bug-ant"]')).toBeNull();
    });
  });

  it('staging a move enables Confirm; confirming sends it and disables the button', async () => {
    const controller = new GameController(new LocalTransport(ALL_ON), ALL_ON);
    await controller.init();
    render(
      <MemoryRouter>
        <AppProviders>
          <GameScreen controller={controller} />
        </AppProviders>
      </MemoryRouter>,
    );
    await screen.findByTestId('hand-tray');

    // Enable confirm-move via the gear (drives controller.setConfirmMove).
    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /confirm move/i }));
    const confirm = (await screen.findByTestId('confirm-move')) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // Stage white's opening placement through the controller.
    act(() => {
      controller.selectHandBug('S');
      controller.selectCell({ q: 0, r: 0 });
    });
    await waitFor(() => expect(confirm.disabled).toBe(false));
    expect(controller.getSnapshot().log).toHaveLength(0); // not yet sent

    fireEvent.click(confirm);
    await waitFor(() => expect(confirm.disabled).toBe(true));
    expect(controller.getSnapshot().log).toEqual([{ kind: 'move', uhp: 'wS1' }]);
  });
});
