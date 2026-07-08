// @vitest-environment jsdom
// The shared lobby UI: the pure helpers (relative/deadline time, badge count,
// friend dedupe) and the grouped list produced by makeLobby (grouping, card
// caption/thumbnail slots, challenge accept/decline, empty state).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
import {
  actionableCount,
  applyTurnBadge,
  friendsFrom,
  makeLobby,
  relativeTime,
  timeLeft,
  type LobbySummary,
} from '../src/lobby-ui';

const NOW = 1_750_000_000_000;

function game(partial: Partial<LobbySummary> & { id: string }): LobbySummary {
  return {
    mySeat: 0,
    opponentName: 'Sam',
    status: 'active',
    toMove: 0,
    updatedAtMs: NOW - 60_000,
    ...partial,
  };
}

const lobby = makeLobby<LobbySummary>({
  renderThumbnail: (g) => <div data-testid={`thumb-${g.id}`} />,
  renderCaption: (g) => `caption:${g.id}`,
});
const { LobbyView } = lobby;

describe('pure helpers', () => {
  it('formats relative and deadline times', () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 3 * 24 * 3_600_000, NOW)).toBe('3d ago');
    expect(timeLeft(NOW + 20 * 60_000, NOW)).toBe('expiring');
    expect(timeLeft(NOW + 5 * 24 * 3_600_000, NOW)).toBe('5d left');
    expect(timeLeft(NOW + 5 * 24 * 3_600_000, NOW, true)).toBe('5d');
  });

  it('actionableCount = my turn + incoming challenges + fresh games', () => {
    expect(
      actionableCount([
        game({ id: 'a', status: 'active', toMove: 0 }),
        game({ id: 'b', status: 'active', toMove: 1 }),
        game({ id: 'c', status: 'open', challenge: { direction: 'incoming', name: 'A' } }),
        game({ id: 'd', status: 'open' }),
        game({ id: 'e', status: 'active', toMove: 1, freshFromOpponent: true }),
      ]),
    ).toBe(3);
  });

  it('friendsFrom dedupes by uid, most recent first', () => {
    expect(
      friendsFrom([
        { opponentUid: 'u1', opponentName: 'Ada', updatedAtMs: 10 },
        { opponentUid: 'u2', opponentName: 'Sam', updatedAtMs: 30 },
        { opponentUid: 'u1', opponentName: 'Ada', updatedAtMs: 20 },
        { opponentName: 'Nameless', updatedAtMs: 40 },
      ]),
    ).toEqual([
      { uid: 'u2', name: 'Sam' },
      { uid: 'u1', name: 'Ada' },
    ]);
  });
});

describe('makeLobby', () => {
  it('groups challenges / your-turn / waiting / finished and renders the slots', () => {
    render(
      <LobbyView
        games={[
          game({ id: 'c1', status: 'open', challenge: { direction: 'incoming', name: 'Ada' } }),
          game({ id: 'y1', status: 'active', toMove: 0, deadlineAtMs: NOW + 26 * 3_600_000 }),
          game({ id: 'w1', status: 'active', toMove: 1 }),
          game({ id: 'f1', status: 'finished', result: 'p0' }),
        ]}
        now={NOW}
        onOpen={() => {}}
        onRespondChallenge={() => {}}
      />,
    );
    expect(screen.getByTestId('group-challenges')).toBeTruthy();
    expect(screen.getByTestId('group-your-turn')).toBeTruthy();
    expect(screen.getByTestId('group-waiting')).toBeTruthy();
    expect(screen.getByTestId('group-finished')).toBeTruthy();
    // Slots: thumbnail + caption on a card; deadline chip on my turn.
    expect(screen.getByTestId('thumb-y1')).toBeTruthy();
    expect(screen.getByText('caption:y1')).toBeTruthy();
    expect(screen.getByTestId('your-turn-chip')).toBeTruthy();
    expect(screen.getByTestId('deadline-chip').textContent).toBe('26h left');
    // Finished result from my seat.
    expect(screen.getByTestId('result-chip').textContent).toBe('Won');
  });

  it('opens a game on tap and responds to challenges', () => {
    const onOpen = vi.fn();
    const onRespond = vi.fn();
    render(
      <LobbyView
        games={[game({ id: 'c1', status: 'open', challenge: { direction: 'incoming', name: 'Ada' } })]}
        now={NOW}
        onOpen={onOpen}
        onRespondChallenge={onRespond}
      />,
    );
    fireEvent.click(screen.getByTestId('challenge-accept-c1'));
    expect(onRespond).toHaveBeenCalledWith('c1', true);
    fireEvent.click(screen.getByTestId('challenge-decline-c1'));
    expect(onRespond).toHaveBeenCalledWith('c1', false);
  });

  it('renders the default empty state with the new-game CTA', () => {
    const onNewGame = vi.fn();
    render(<LobbyView games={[]} now={NOW} onOpen={() => {}} onNewGame={onNewGame} />);
    expect(screen.getByTestId('lobby-empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /start a new game/i }));
    expect(onNewGame).toHaveBeenCalled();
  });
});

describe('applyTurnBadge', () => {
  it('prefixes the document title with the count and clears at zero', () => {
    applyTurnBadge(3, 'PARLOR');
    expect(document.title).toBe('(3) PARLOR');
    applyTurnBadge(0, 'PARLOR');
    expect(document.title).toBe('PARLOR');
  });
});
