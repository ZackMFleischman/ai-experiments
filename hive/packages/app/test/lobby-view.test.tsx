// T4.7: lobby presentation — grouping, chips, thumbnails, empty state — and
// the new-game form + invite-link view. All fixture-fed (no firestore).
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { initialState, serializeState, type GameOptions } from '@hive/engine';
import { AppProviders } from '../src/App';
import { LobbyView, relativeTime, timeLeft, type LobbyGameSummary } from '../src/screens/lobbyView';
import { InviteLinkView, NewGameForm, friendsFrom } from '../src/screens/newGameView';

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
    mySeat: 0, // white
    opponentName: 'Sam',
    status: 'active',
    toMove: 0, // white to move → my turn by default
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
          game({ id: 'a', toMove: 0 }),
          game({ id: 'b', toMove: 1 }),
          game({ id: 'c', status: 'open', opponentName: null }),
          game({ id: 'd', status: 'finished', result: 'p0' }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId('group-your-turn')).toBeTruthy();
    expect(screen.getByTestId('your-turn-chip')).toBeTruthy();
    expect(screen.getByTestId('group-waiting')).toBeTruthy();
    // The open invite (no opponent yet) lands in the waiting group.
    expect(screen.getByText(/open invite/i)).toBeTruthy();
    expect(screen.getByTestId('group-finished')).toBeTruthy();
    expect(screen.getByTestId('result-chip').textContent).toBe('Won');
  });

  it('shows Lost for a finished game the opponent won', () => {
    renderIn(
      <LobbyView games={[game({ status: 'finished', result: 'p1' })]} now={NOW} onOpen={() => {}} />,
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

  it('shows a deadline countdown on your-turn cards (T5.5)', () => {
    renderIn(
      <LobbyView
        games={[game({ toMove: 0, deadlineAtMs: NOW + 30 * 3_600_000 })]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId('deadline-chip').textContent).toBe('30h left');
  });

  it('formats deadline countdowns', () => {
    expect(timeLeft(NOW + 3 * 86_400_000, NOW)).toBe('3d left');
    expect(timeLeft(NOW + 5 * 3_600_000, NOW)).toBe('5h left');
    expect(timeLeft(NOW + 60_000, NOW)).toBe('expiring');
  });

  it('formats relative times', () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3h ago');
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe('2d ago');
  });

  it('renders an incoming challenge with accept/decline wired', () => {
    const onRespond = vi.fn();
    renderIn(
      <LobbyView
        games={[
          game({
            id: 'ch1',
            status: 'open',
            opponentName: 'Ada',
            challenge: { direction: 'incoming', name: 'Ada' },
          }),
        ]}
        now={NOW}
        onOpen={() => {}}
        onRespondChallenge={onRespond}
      />,
    );
    expect(screen.getByTestId('group-challenges')).toBeTruthy();
    expect(screen.getByText(/Ada/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('challenge-accept-ch1'));
    expect(onRespond).toHaveBeenCalledWith('ch1', true);
    fireEvent.click(screen.getByTestId('challenge-decline-ch1'));
    expect(onRespond).toHaveBeenCalledWith('ch1', false);
  });

  it('shows an outgoing challenge under waiting with a challenge-sent chip', () => {
    renderIn(
      <LobbyView
        games={[
          game({
            id: 'ch2',
            status: 'open',
            opponentName: 'Sam',
            challenge: { direction: 'outgoing', name: 'Sam' },
          }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId('group-waiting')).toBeTruthy();
    expect(screen.getByText('Challenge sent')).toBeTruthy();
    expect(screen.queryByTestId('group-challenges')).toBeNull();
  });
});

describe('NewGameForm', () => {
  it('creates with all-on defaults and random color', () => {
    const onCreate = vi.fn();
    renderIn(<NewGameForm onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onCreate).toHaveBeenCalledWith({
      options: OPTIONS,
      color: 'random',
      timeControlDays: 3,
      opponent: null,
    });
  });

  it('honors toggles and color choice', () => {
    const onCreate = vi.fn();
    renderIn(<NewGameForm onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('color-b'));
    fireEvent.click(screen.getByTestId('toggle-pillbug'));
    fireEvent.click(screen.getByTestId('time-none'));
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onCreate).toHaveBeenCalledWith({
      options: { ...OPTIONS, pillbug: false },
      color: 'b',
      timeControlDays: null,
      opponent: null,
    });
  });

  it('hides the opponent picker when there are no past opponents', () => {
    renderIn(<NewGameForm onCreate={() => {}} />);
    expect(screen.queryByTestId('opponent-link')).toBeNull();
  });

  it('challenges a picked friend instead of minting an invite', () => {
    const onCreate = vi.fn();
    renderIn(
      <NewGameForm
        onCreate={onCreate}
        friends={[
          { uid: 'u-ada', name: 'Ada' },
          { uid: 'u-sam', name: 'Sam' },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId('opponent-u-sam'));
    expect(screen.getByTestId('create-game').textContent).toMatch(/challenge Sam/i);
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onCreate).toHaveBeenCalledWith({
      options: OPTIONS,
      color: 'random',
      timeControlDays: 3,
      opponent: { uid: 'u-sam', name: 'Sam' },
    });
    // switching back to the invite link restores the plain create
    fireEvent.click(screen.getByTestId('opponent-link'));
    expect(screen.getByTestId('create-game').textContent).toMatch(/create game/i);
  });
});

describe('friendsFrom', () => {
  it('dedupes opponents, most recent first, skipping unseated invites', () => {
    expect(
      friendsFrom([
        { opponentUid: 'u1', opponentName: 'Ada', updatedAtMs: 100 },
        { opponentName: null, updatedAtMs: 400 }, // open invite, nobody joined
        { opponentUid: 'u2', opponentName: 'Sam', updatedAtMs: 300 },
        { opponentUid: 'u1', opponentName: 'Ada L.', updatedAtMs: 200 },
      ]),
    ).toEqual([
      { uid: 'u2', name: 'Sam' },
      { uid: 'u1', name: 'Ada L.' }, // freshest name wins
    ]);
  });
});

describe('InviteLinkView', () => {
  it('shows the link and the bare code, and opens the game', () => {
    const onOpen = vi.fn();
    renderIn(<InviteLinkView code="CODE1234" gameId="g9" onOpenGame={onOpen} />);
    expect(screen.getByTestId('invite-url')).toHaveProperty(
      'value',
      `${window.location.origin}/join/CODE1234`,
    );
    expect(screen.getByTestId('invite-code').textContent).toBe('CODE1234');
    fireEvent.click(screen.getByTestId('open-created-game'));
    expect(onOpen).toHaveBeenCalledWith('g9');
  });
});
