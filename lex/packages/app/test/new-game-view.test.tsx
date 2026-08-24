// T4.7: the new-game form — FR-6/7 pickers (board with premium-map preview,
// dictionary with word counts), turn order, time control, opponent chips.
// Fixture-fed (firebase-free); sync/NewGameFlow wires the callables.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewGameForm, InviteLinkView, type NewGameChoices } from '../src/screens/newGameView';

function create(overrides?: { friends?: Array<{ uid: string; name: string }> }): {
  onCreate: ReturnType<typeof vi.fn>;
  submit: () => NewGameChoices;
} {
  const onCreate = vi.fn();
  render(<NewGameForm onCreate={onCreate} friends={overrides?.friends ?? []} />);
  return {
    onCreate,
    submit: () => {
      fireEvent.click(screen.getByTestId('create-game'));
      // The LATEST call, not the first: a test that changes a pick and
      // re-submits must read what it just submitted.
      return onCreate.mock.calls.at(-1)?.[0] as NewGameChoices;
    },
  };
}

describe('NewGameForm', () => {
  it('defaults: classic board, NWL2023 dictionary, random first, 3 days, invalid words blocked', () => {
    const { submit } = create();
    expect(submit()).toEqual({
      options: {
        rulesetId: 'classic',
        dictionaryId: 'nwl2023',
        timeControl: { days: 3 },
        invalidWords: 'blocked',
      },
      seat: 'random',
      opponent: null,
    });
  });

  it('picks what invalid words do, and states the rule for the pick (DESIGN §2.3)', () => {
    const { submit } = create();
    // A named setting with two values, like turn order and time control — and
    // the blurb tracks the selection, so a host can't choose the turn-costing
    // rule without reading what it does to their opponent.
    expect(screen.getByText(/checked as you place it/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('invalid-words-costs-turn'));
    expect(screen.getByText(/costs your turn/i)).toBeTruthy();
    expect(submit().options.invalidWords).toBe('costs-turn');
    // …and it is reversible: picking the default back gives the default.
    fireEvent.click(screen.getByTestId('invalid-words-blocked'));
    expect(submit().options.invalidWords).toBe('blocked');
  });

  it('offers both boards with a mini premium-map preview (FR-6)', () => {
    const { submit } = create();
    expect(screen.getAllByTestId('mini-board').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByTestId('board-modern'));
    expect(submit().options.rulesetId).toBe('modern');
  });

  it('labels dictionaries with name + word count (FR-7)', () => {
    const { submit } = create();
    expect(screen.getByText(/Tournament-style/)).toBeTruthy();
    expect(screen.getByText(/173k words/)).toBeTruthy();
    expect(screen.getByText(/Everyday words/)).toBeTruthy();
    expect(screen.getByText(/82k words/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('dictionary-enable1'));
    expect(submit().options.dictionaryId).toBe('enable1');
  });

  it('picks turn order and time control', () => {
    const { submit } = create();
    fireEvent.click(screen.getByTestId('seat-me'));
    fireEvent.click(screen.getByTestId('time-none'));
    const choices = submit();
    expect(choices.seat).toBe('me');
    expect(choices.options.timeControl).toBeNull();
  });

  it('switches to a direct challenge when a friend chip is picked', () => {
    const { submit } = create({ friends: [{ uid: 'u9', name: 'Sam' }] });
    fireEvent.click(screen.getByTestId('opponent-u9'));
    expect(screen.getByTestId('create-game').textContent).toMatch(/Challenge Sam/);
    expect(submit().opponent).toEqual({ uid: 'u9', name: 'Sam' });
  });
});

describe('InviteLinkView', () => {
  it('shows the shareable link + code and opens the game', () => {
    const onOpen = vi.fn();
    render(<InviteLinkView code="ABCD2345" gameId="g1" onOpenGame={onOpen} />);
    expect((screen.getByTestId('invite-url') as HTMLInputElement).value).toContain(
      '/join/ABCD2345',
    );
    expect(screen.getByTestId('invite-code').textContent).toBe('ABCD2345');
    fireEvent.click(screen.getByTestId('open-created-game'));
    expect(onOpen).toHaveBeenCalledWith('g1');
  });
});
