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
  finalStandings,
  friendsFrom,
  isWinner,
  makeLobby,
  placingOf,
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

// ── M7 T7.9: N seats on the lobby contract ─────────────────────────────────
// `result` stays the two-seat wire form; everything N-shaped reads it through
// finalStandings(), so a game finished before M7 still places correctly.
describe('finalStandings / placingOf', () => {
  const base = {
    id: 'g',
    mySeat: 0,
    opponentName: 'Sam',
    status: 'finished' as const,
    toMove: 0,
    updatedAtMs: 0,
  };

  it('reads the two-seat result when there are no standings', () => {
    expect(finalStandings({ ...base, result: 'p0' })).toEqual([[0], [1]]);
    expect(finalStandings({ ...base, result: 'p1' })).toEqual([[1], [0]]);
    expect(finalStandings({ ...base, result: 'draw' })).toEqual([[0, 1]]);
  });

  it('prefers standings when the game carries them', () => {
    const game = { ...base, result: 'p0' as const, standings: [[2], [0, 1]] };
    expect(finalStandings(game)).toEqual([[2], [0, 1]]);
  });

  it('is empty while the game is unfinished', () => {
    expect(finalStandings({ ...base, status: 'active' })).toEqual([]);
    expect(placingOf({ ...base, status: 'active' }, 0)).toBeNull();
  });

  it('gives tied seats the same placing', () => {
    const game = { ...base, standings: [[3], [0, 1], [2]] };
    expect(placingOf(game, 3)).toBe(1);
    expect(placingOf(game, 0)).toBe(2);
    expect(placingOf(game, 1)).toBe(2);
    expect(placingOf(game, 2)).toBe(3);
    expect(placingOf(game, 9)).toBeNull();
  });

  it('isWinner covers an outright win and a shared top placing', () => {
    expect(isWinner({ ...base, standings: [[1], [0]] }, 1)).toBe(true);
    expect(isWinner({ ...base, standings: [[1], [0]] }, 0)).toBe(false);
    expect(isWinner({ ...base, standings: [[0, 1]] }, 0)).toBe(true);
    expect(isWinner({ ...base, result: 'draw' }, 1)).toBe(true);
  });
});

describe('friendsFrom over N seats', () => {
  const game = (over: Record<string, unknown>) => ({
    opponentName: null,
    updatedAtMs: 0,
    ...over,
  });

  it('collects every other player from a 3+ game, not just one', () => {
    const friends = friendsFrom([
      game({
        updatedAtMs: 2,
        opponents: [
          { uid: 'u-sam', name: 'Sam' },
          { uid: 'u-lee', name: 'Lee' },
        ],
      }),
    ]);
    expect(friends).toEqual([
      { uid: 'u-sam', name: 'Sam' },
      { uid: 'u-lee', name: 'Lee' },
    ]);
  });

  it('still reads the two-seat pair when there is no opponents list', () => {
    expect(friendsFrom([game({ opponentUid: 'u-sam', opponentName: 'Sam' })])).toEqual([
      { uid: 'u-sam', name: 'Sam' },
    ]);
  });

  it('dedupes across games, most recent first', () => {
    const friends = friendsFrom([
      game({ updatedAtMs: 1, opponents: [{ uid: 'u-sam', name: 'Sam' }] }),
      game({ updatedAtMs: 3, opponents: [{ uid: 'u-lee', name: 'Lee' }, { uid: 'u-sam', name: 'Sam' }] }),
    ]);
    expect(friends.map((f) => f.uid)).toEqual(['u-lee', 'u-sam']);
  });

  it('skips a player with no uid — a guest-list name is not challengeable', () => {
    expect(friendsFrom([game({ opponents: [{ name: 'Anonymous' }] })])).toEqual([]);
  });
});

describe('actionableCount with withdrawals', () => {
  const g = (over: Record<string, unknown>) => ({
    id: 'g',
    mySeat: 0,
    opponentName: null,
    status: 'active' as const,
    toMove: 0,
    updatedAtMs: 0,
    ...over,
  });

  it('does not nag a player who has withdrawn, even on their nominal turn', () => {
    expect(actionableCount([g({ withdrawn: [0] })])).toBe(0);
    expect(actionableCount([g({ withdrawn: [1] })])).toBe(1);
  });
});
