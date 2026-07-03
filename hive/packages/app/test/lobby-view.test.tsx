// T4.7: lobby presentation — grouping, chips, thumbnails, empty state — and
// the new-game form + invite-link view. All fixture-fed (no firestore).
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { initialState, serializeState, type GameOptions } from '@hive/engine';
import { AppProviders } from '../src/App';
import { LobbyView, relativeTime, type LobbyGameSummary } from '../src/screens/lobbyView';
import { InviteLinkView, NewGameForm } from '../src/screens/newGameView';

const OPTIONS: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

const NOW = 1_000_000_000_000;
const STATE = serializeState(initialState(OPTIONS));

function game(over: Partial<LobbyGameSummary>): LobbyGameSummary {
  return {
    id: 'g1',
    myColor: 'w',
    opponentName: 'Sam',
    status: 'active',
    toMove: 'w',
    updatedAtMs: NOW - 60_000,
    state: STATE,
    ...over,
  };
}

function renderIn(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AppProviders>{node}</AppProviders>
    </MemoryRouter>,
  );
}

describe('LobbyView', () => {
  it('groups games into your-turn / waiting / finished', () => {
    renderIn(
      <LobbyView
        games={[
          game({ id: 'a', toMove: 'w' }),
          game({ id: 'b', toMove: 'b' }),
          game({ id: 'c', status: 'open', opponentName: null }),
          game({ id: 'd', status: 'finished', result: 'white' }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId('group-your-turn')).toBeTruthy();
    expect(screen.getByTestId('your-turn-chip')).toBeTruthy();
    expect(screen.getByTestId('group-waiting')).toBeTruthy();
    expect(screen.getByText(/waiting for opponent/i)).toBeTruthy();
    expect(screen.getByTestId('group-finished')).toBeTruthy();
    expect(screen.getByTestId('result-chip').textContent).toBe('Won');
  });

  it('shows Lost for a finished game the opponent won', () => {
    renderIn(
      <LobbyView games={[game({ status: 'finished', result: 'black' })]} now={NOW} onOpen={() => {}} />,
    );
    expect(screen.getByTestId('result-chip').textContent).toBe('Lost');
  });

  it('opens a game on card click', () => {
    const onOpen = vi.fn();
    renderIn(<LobbyView games={[game({ id: 'xyz' })]} now={NOW} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('game-card-xyz'));
    expect(onOpen).toHaveBeenCalledWith('xyz');
  });

  it('renders the empty state', () => {
    renderIn(<LobbyView games={[]} now={NOW} onOpen={() => {}} />);
    expect(screen.getByTestId('lobby-empty')).toBeTruthy();
  });

  it('formats relative times', () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3h ago');
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe('2d ago');
  });
});

describe('NewGameForm', () => {
  it('creates with all-on defaults and random color', () => {
    const onCreate = vi.fn();
    renderIn(<NewGameForm onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onCreate).toHaveBeenCalledWith({ options: OPTIONS, color: 'random' });
  });

  it('honors toggles and color choice', () => {
    const onCreate = vi.fn();
    renderIn(<NewGameForm onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('color-b'));
    fireEvent.click(screen.getByTestId('toggle-pillbug'));
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onCreate).toHaveBeenCalledWith({
      options: { ...OPTIONS, pillbug: false },
      color: 'b',
    });
  });
});

describe('InviteLinkView', () => {
  it('shows the url and opens the game', () => {
    const onOpen = vi.fn();
    renderIn(<InviteLinkView url="https://x/join/CODE1234" gameId="g9" onOpenGame={onOpen} />);
    expect(screen.getByTestId('invite-url')).toHaveProperty('value', 'https://x/join/CODE1234');
    fireEvent.click(screen.getByTestId('open-created-game'));
    expect(onOpen).toHaveBeenCalledWith('g9');
  });
});
