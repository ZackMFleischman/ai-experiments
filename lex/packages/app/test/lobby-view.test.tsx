// ported from hive/packages/app/test/lobby-view.test.tsx (adapted)
// T4.7: lobby presentation — grouping, cards with scores + last play,
// challenge accept/decline, badge arithmetic. All fixture-fed (firebase-free).
import { fireEvent, render, screen } from '@testing-library/react';
import { RULESETS, initialState, serializePublic } from '@lex/engine';
import { describe, expect, it, vi } from 'vitest';
import { LobbyView, relativeTime, timeLeft, type LobbyGameSummary } from '../src/screens/lobbyView';
import { friendsFrom } from '../src/screens/newGameView';
import { actionableCount } from '../src/screens/turnBadge';

const classic = RULESETS['classic']!;
const ORDER = Object.entries(classic.tiles.counts).flatMap(([face, count]) =>
  Array.from({ length: count }, () => face),
);
const EMPTY_PUBLIC = serializePublic(initialState(classic, ORDER, 2));

const NOW = 1_750_000_000_000;

function game(partial: Partial<LobbyGameSummary> & { id: string }): LobbyGameSummary {
  return {
    mySeat: 0,
    opponentName: 'Sam',
    status: 'active',
    toMove: 0,
    updatedAtMs: NOW - 60_000,
    public: EMPTY_PUBLIC,
    rulesetId: 'classic',
    scores: [0, 0],
    ...partial,
  };
}

describe('LobbyView grouping', () => {
  it('groups challenges / your-turn / waiting / finished', () => {
    const games = [
      game({ id: 'c1', status: 'open', challenge: { direction: 'incoming', name: 'Ada' } }),
      game({ id: 'y1', status: 'active', toMove: 0 }),
      game({ id: 'w1', status: 'active', toMove: 1 }),
      game({ id: 'o1', status: 'open' }),
      game({ id: 'f1', status: 'finished', result: 'p0' }),
    ];
    render(<LobbyView games={games} now={NOW} onOpen={() => {}} />);
    expect(screen.getByTestId('group-challenges')).toBeTruthy();
    expect(screen.getByTestId('group-your-turn')).toBeTruthy();
    expect(screen.getByTestId('group-waiting')).toBeTruthy();
    expect(screen.getByTestId('group-finished')).toBeTruthy();
    // The open invite and the not-my-turn game both wait.
    expect(screen.getByTestId('game-card-w1')).toBeTruthy();
    expect(screen.getByTestId('game-card-o1')).toBeTruthy();
  });

  it('shows the empty state when there are no games', () => {
    render(<LobbyView games={[]} now={NOW} onOpen={() => {}} />);
    expect(screen.getByTestId('lobby-empty')).toBeTruthy();
  });
});

describe('game cards', () => {
  it('carries scores + the last play in the caption (DESIGN §7.1)', () => {
    render(
      <LobbyView
        games={[
          game({
            id: 'g1',
            toMove: 0,
            scores: [212, 198],
            lastPlay: { by: 1, word: 'QUIZ', score: 68 },
          }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/You 212 · Sam 198 — Sam played QUIZ \+68/)).toBeTruthy();
    expect(screen.getByTestId('your-turn-chip')).toBeTruthy();
  });

  it('marks finished games won/lost/draw from my seat', () => {
    render(
      <LobbyView
        games={[
          game({ id: 'won', status: 'finished', result: 'p0' }),
          game({ id: 'lost', status: 'finished', result: 'p1' }),
          game({ id: 'draw', status: 'finished', result: 'draw' }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    const chips = screen.getAllByTestId('result-chip').map((c) => c.textContent);
    expect(chips).toEqual(['Won', 'Lost', 'Draw']);
  });

  it('opens a game on tap and shows the deadline chip on my turn', () => {
    const onOpen = vi.fn();
    render(
      <LobbyView
        games={[game({ id: 'g1', toMove: 0, deadlineAtMs: NOW + 26 * 3_600_000 })]}
        now={NOW}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByTestId('deadline-chip').textContent).toBe('26h left');
    fireEvent.click(screen.getByTestId('game-card-g1'));
    expect(onOpen).toHaveBeenCalledWith('g1');
  });

  it("shows the opponent's clock on waiting cards too (current player's deadline)", () => {
    render(
      <LobbyView
        games={[game({ id: 'w1', toMove: 1, deadlineAtMs: NOW + 5 * 3_600_000 })]}
        now={NOW}
        onOpen={() => {}}
      />,
    );
    // Not my turn: no your-turn chip, but the deadline chip still runs.
    expect(screen.queryByTestId('your-turn-chip')).toBeNull();
    expect(screen.getByTestId('deadline-chip').textContent).toBe('5h left');
  });
});

describe('challenge cards', () => {
  it('accepts and declines through the callback', () => {
    const onRespond = vi.fn();
    render(
      <LobbyView
        games={[
          game({ id: 'c1', status: 'open', challenge: { direction: 'incoming', name: 'Ada' } }),
        ]}
        now={NOW}
        onOpen={() => {}}
        onRespondChallenge={onRespond}
      />,
    );
    expect(screen.getByText(/Ada challenges you/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('challenge-accept-c1'));
    expect(onRespond).toHaveBeenCalledWith('c1', true);
    fireEvent.click(screen.getByTestId('challenge-decline-c1'));
    expect(onRespond).toHaveBeenCalledWith('c1', false);
  });
});

describe('badge + helpers', () => {
  it('actionableCount = my turn + incoming challenges + fresh games', () => {
    const games = [
      game({ id: 'a', status: 'active', toMove: 0 }), // my turn
      game({ id: 'b', status: 'active', toMove: 1 }), // waiting
      game({ id: 'c', status: 'open', challenge: { direction: 'incoming', name: 'A' } }),
      game({ id: 'd', status: 'open' }), // my own invite out
      game({ id: 'e', status: 'active', toMove: 1, freshFromOpponent: true }),
    ];
    expect(actionableCount(games)).toBe(3);
  });

  it('friendsFrom dedupes by uid, most recent first', () => {
    const friends = friendsFrom([
      { opponentUid: 'u1', opponentName: 'Ada', updatedAtMs: 10 },
      { opponentUid: 'u2', opponentName: 'Sam', updatedAtMs: 30 },
      { opponentUid: 'u1', opponentName: 'Ada', updatedAtMs: 20 },
      { opponentName: 'Nameless', updatedAtMs: 40 },
    ]);
    expect(friends).toEqual([
      { uid: 'u2', name: 'Sam' },
      { uid: 'u1', name: 'Ada' },
    ]);
  });

  it('formats deadlines and relative times', () => {
    expect(timeLeft(NOW + 20 * 60_000, NOW)).toBe('expiring');
    expect(timeLeft(NOW + 5 * 24 * 3_600_000, NOW)).toBe('5d left');
    // Compact form drops "left" (paired with a clock icon) and says "soon".
    expect(timeLeft(NOW + 5 * 24 * 3_600_000, NOW, true)).toBe('5d');
    expect(timeLeft(NOW + 20 * 60_000, NOW, true)).toBe('soon');
    expect(relativeTime(NOW - 30_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 3 * 24 * 3_600_000, NOW)).toBe('3d ago');
  });
});
