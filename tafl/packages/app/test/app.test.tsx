// @vitest-environment jsdom
// App wiring under fake storage: routes render, the hot-seat game plays a
// real move through the LogSession fold (clicks → engine → board), resign
// flows, and the stored game survives a remount.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '@parlor/core';
import { AppProviders } from '../src/App';
import { GameScreen } from '../src/game/GameScreen';
import { createLocalSession } from '../src/game/localSession';
import { Landing } from '../src/screens/Landing';
import { Lobby } from '../src/screens/Lobby';

afterEach(cleanup);

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

async function renderHotSeat(storage: KeyValueStorage) {
  const session = await createLocalSession(storage);
  const utils = render(
    <MemoryRouter>
      <AppProviders>
        <GameScreen session={session} mode={{ kind: 'hotseat' }} seatNames={[null, null]} onExit={() => {}} />
      </AppProviders>
    </MemoryRouter>,
  );
  return { session, ...utils };
}

const cell = (name: string): HTMLElement => {
  const match = screen
    .getAllByRole('gridcell')
    .find((c) => (c.getAttribute('aria-label') ?? '').startsWith(name));
  if (!match) throw new Error(`cell ${name} not found`);
  return match;
};

describe('hot-seat game', () => {
  it('renders the initial position with attackers to move', async () => {
    await renderHotSeat(memoryStorage());
    expect(screen.getByRole('grid', { name: 'tafl board' })).toBeTruthy();
    expect(screen.getAllByRole('gridcell')).toHaveLength(49);
    expect(screen.getByTestId('status-line').textContent).toContain('Attackers to move');
    expect(cell('d4').getAttribute('aria-label')).toBe('d4 king');
  });

  it('a click-move folds through the engine and flips the turn', async () => {
    await renderHotSeat(memoryStorage());
    // Attacker at d6 (row1,col3 = cell 10) → a6 (row1,col0 = cell 7).
    fireEvent.click(cell('d6'));
    await waitFor(() => expect(screen.getAllByTestId('move-target').length).toBeGreaterThan(0));
    fireEvent.click(cell('a6'));
    await waitFor(() =>
      expect(screen.getByTestId('status-line').textContent).toContain('Defenders to move'),
    );
    expect(cell('a6').getAttribute('aria-label')).toBe('a6 attacker');
  });

  it('the wrong side cannot pick a piece up', async () => {
    await renderHotSeat(memoryStorage());
    fireEvent.click(cell('d5')); // defender piece, attackers to move
    expect(screen.queryAllByTestId('move-target')).toHaveLength(0);
  });

  it('the stored game survives a remount (localStorage transport)', async () => {
    const storage = memoryStorage();
    const first = await renderHotSeat(storage);
    fireEvent.click(cell('d6'));
    await waitFor(() => expect(screen.getAllByTestId('move-target').length).toBeGreaterThan(0));
    fireEvent.click(cell('a6'));
    await waitFor(() =>
      expect(screen.getByTestId('status-line').textContent).toContain('Defenders to move'),
    );
    first.unmount();
    await renderHotSeat(storage);
    expect(screen.getByTestId('status-line').textContent).toContain('Defenders to move');
    expect(cell('a6').getAttribute('aria-label')).toBe('a6 attacker');
  });

  it('resign ends the game for the other side', async () => {
    await renderHotSeat(memoryStorage());
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resign' }));
    await waitFor(() => expect(screen.getByTestId('outcome').textContent).toContain('Defenders win'));
  });
});

describe('shell screens', () => {
  it('landing renders the wordmark, tagline, and hero board', () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <Landing />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(screen.getByText('TAFL')).toBeTruthy();
    expect(screen.getByText('The Viking siege game, for two.')).toBeTruthy();
  });

  it('the static lobby offers hot-seat play', () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <Lobby />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Play hot-seat' })).toBeTruthy();
    expect(screen.getByText(/two players, one device/)).toBeTruthy();
  });
});
