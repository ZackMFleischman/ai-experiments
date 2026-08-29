// T7.15: the new-game form over N seats. The player count comes from the
// SELECTED ruleset's `players` range (never a hard-coded 2–4), a board that
// cannot seat the chosen count is disabled with its reason, the invite row is
// single-select at two seats and uncapped at three or more, and the pace line
// states how long a round takes at this table size. The two-seat behaviour is
// pinned by new-game-view.test.tsx, which this file must leave untouched.
import { fireEvent, render, screen } from '@testing-library/react';
import { RULESETS, type Ruleset } from '@lex/engine';
import { describe, expect, it, vi } from 'vitest';
import { clampCount, paceLine, seatCounts } from '../src/gameOptions';
import { NewGameForm, type Friend, type NewGameChoices } from '../src/screens/newGameView';

const classic = RULESETS['classic']!;
// A board with a narrower range than classic's. Both v1 rulesets are {2,4}, so
// the day a reduced-tile board lands is the day this becomes reachable in the
// product — the form reads the range either way.
const TRIO: Ruleset = { ...classic, id: 'trio', players: { min: 2, max: 3 } };
const BOARDS: Readonly<Record<string, Ruleset>> = { classic, trio: TRIO };

const FRIENDS = [
  { uid: 'u9', name: 'Sam' },
  { uid: 'u7', name: 'Noor' },
];

function form(opts?: {
  rulesets?: Readonly<Record<string, Ruleset>>;
  initial?: { players?: number; invite?: readonly Friend[] };
}): { submit: () => NewGameChoices } {
  const onCreate = vi.fn();
  render(
    <NewGameForm
      onCreate={onCreate}
      friends={FRIENDS}
      rulesets={opts?.rulesets ?? RULESETS}
      {...(opts?.initial ? { initial: opts.initial } : {})}
    />,
  );
  return {
    submit: () => {
      fireEvent.click(screen.getByTestId('create-game'));
      return onCreate.mock.calls.at(-1)?.[0] as NewGameChoices;
    },
  };
}

describe('the player count', () => {
  it('offers exactly the selected ruleset’s range, and opens at its minimum', () => {
    form();
    expect(screen.getByTestId('player-count')).toBeTruthy();
    expect(screen.getByTestId('count-2').getAttribute('aria-pressed')).toBe('true');
    for (const n of seatCounts(classic.players)) expect(screen.getByTestId(`count-${n}`)).toBeTruthy();
    expect(screen.queryByTestId(`count-${classic.players.max + 1}`)).toBeNull();
  });

  it('sends the count as maxPlayers — and sends nothing at all at two', () => {
    const two = form();
    expect(two.submit().options.maxPlayers).toBeUndefined();
    fireEvent.click(screen.getByTestId('count-4'));
    expect(two.submit().options.maxPlayers).toBe(4);
  });

  it('follows the board: a narrower board offers fewer counts', () => {
    const { submit } = form({ rulesets: BOARDS });
    expect(screen.getByTestId('count-4')).toBeTruthy(); // classic seats four
    fireEvent.click(screen.getByTestId('board-trio'));
    expect(screen.queryByTestId('count-4')).toBeNull();
    expect(submit().options.rulesetId).toBe('trio');
  });

  it('clamps a count the selected board cannot seat', () => {
    const narrow: Readonly<Record<string, Ruleset>> = { classic: TRIO, modern: RULESETS['modern']! };
    const { submit } = form({ rulesets: narrow, initial: { players: 4 } });
    expect(screen.queryByTestId('count-4')).toBeNull();
    expect(screen.getByTestId('count-3').getAttribute('aria-pressed')).toBe('true');
    expect(submit().options.maxPlayers).toBe(3);
  });

  it('clampCount pulls a count into the range from either end', () => {
    expect(clampCount(4, { min: 2, max: 3 })).toBe(3);
    expect(clampCount(2, { min: 3, max: 4 })).toBe(3);
    expect(clampCount(3, classic.players)).toBe(3);
  });
});

describe('boards outside the range', () => {
  it('are disabled with the reason, not hidden', () => {
    form({ rulesets: BOARDS, initial: { players: 4 } });
    const trio = screen.getByTestId('board-trio') as HTMLButtonElement;
    expect(trio).toBeTruthy(); // still on the screen
    expect(trio.disabled).toBe(true);
    expect(screen.getByTestId('board-trio-unavailable').textContent).toBe('Takes 2–3 players');
    expect((screen.getByTestId('board-classic') as HTMLButtonElement).disabled).toBe(false);
  });

  it('come back the moment the count fits again', () => {
    form({ rulesets: BOARDS, initial: { players: 4 } });
    fireEvent.click(screen.getByTestId('count-3'));
    expect((screen.getByTestId('board-trio') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('board-trio-unavailable')).toBeNull();
  });
});

describe('the invite row', () => {
  it('picks exactly one opponent at two seats', () => {
    const { submit } = form();
    fireEvent.click(screen.getByTestId('opponent-u9'));
    fireEvent.click(screen.getByTestId('opponent-u7'));
    const choices = submit();
    expect(choices.opponent).toEqual({ uid: 'u7', name: 'Noor' });
    expect(choices.invite).toBeUndefined();
    // And the open-seat option is still there to go back to.
    fireEvent.click(screen.getByTestId('opponent-link'));
    expect(submit().opponent).toBeNull();
  });

  it('takes as many as you like at three or more — a seat is not reserved', () => {
    const { submit } = form();
    fireEvent.click(screen.getByTestId('count-3'));
    fireEvent.click(screen.getByTestId('opponent-u9'));
    fireEvent.click(screen.getByTestId('opponent-u7'));
    const choices = submit();
    expect(choices.invite).toEqual(FRIENDS);
    // Nobody is challenged: at 3+ every guest arrives through the room.
    expect(choices.opponent).toBeNull();
    expect(screen.queryByTestId('opponent-link')).toBeNull();
  });

  it('un-picks on a second tap at three or more', () => {
    const { submit } = form();
    fireEvent.click(screen.getByTestId('count-4'));
    fireEvent.click(screen.getByTestId('opponent-u9'));
    fireEvent.click(screen.getByTestId('opponent-u9'));
    expect(submit().invite).toEqual([]);
  });

  it('falls back to the first pick when the table shrinks to two', () => {
    const { submit } = form({ initial: { players: 4, invite: FRIENDS } });
    fireEvent.click(screen.getByTestId('count-2'));
    const choices = submit();
    expect(choices.opponent).toEqual(FRIENDS[0]);
    expect(choices.invite).toBeUndefined();
  });
});

describe('the pace of a round', () => {
  it('states the wait at the chosen count, and goes away without a clock', () => {
    form();
    expect(screen.getByTestId('pace-line').textContent).toBe(
      '3 days per move — about 6 days a round at 2 players',
    );
    fireEvent.click(screen.getByTestId('count-4'));
    expect(screen.getByTestId('pace-line').textContent).toBe(
      '3 days per move — about 12 days a round at 4 players',
    );
    fireEvent.click(screen.getByTestId('time-1d'));
    expect(screen.getByTestId('pace-line').textContent).toBe(
      '1 day per move — about 4 days a round at 4 players',
    );
    fireEvent.click(screen.getByTestId('time-none'));
    expect(screen.queryByTestId('pace-line')).toBeNull();
  });

  it('paceLine is nothing without a time control', () => {
    expect(paceLine(null, 4)).toBeNull();
    expect(paceLine({ days: 7 }, 3)).toBe('7 days per move — about 21 days a round at 3 players');
  });
});

describe('turn order', () => {
  it('is the two-seat toggle at two, and a turn-order choice at three or more', () => {
    const { submit } = form();
    fireEvent.click(screen.getByTestId('seat-me'));
    expect(submit().seat).toBe('me');
    fireEvent.click(screen.getByTestId('count-3'));
    // The 3+ picker replaces the toggles; nobody has joined, so the order is
    // settled in the room and 'random' is what the create call carries.
    expect(screen.queryByTestId('seat-me')).toBeNull();
    expect(screen.getByTestId('order-mode-random')).toBeTruthy();
    expect(submit().seat).toEqual({ mode: 'random' });
  });
});
