// @vitest-environment jsdom
// The shared 3+ game room: the pure guest-list model (host, open seats, the
// arrangement preview, the manual reorder) and the components built on it —
// the turn-order picker at two AND at four seats, the guest list, the start
// bar's early-start confirmation, the invitee's accept/decline screen, and
// the join card's `closed` state.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
import {
  arrangedOrder,
  canStart,
  GameRoom,
  GuestListView,
  hostOf,
  InvitationReceived,
  isHost,
  JoinCard,
  moveInOrder,
  openSeats,
  StartGameBar,
  TurnOrderPicker,
  type GuestList,
  type RosterEntry,
  type TurnOrderChoice,
} from '../src/lobby-ui';

const entry = (uid: string, name: string): RosterEntry => ({ uid, name });
const ADA = entry('u-ada', 'Ada');
const SAM = entry('u-sam', 'Sam');
const LEE = entry('u-lee', 'Lee');
const KIM = entry('u-kim', 'Kim');

function list(over: Partial<GuestList> = {}): GuestList {
  return { roster: [ADA, SAM, LEE], invited: [], declined: [], ...over };
}

describe('roster model', () => {
  it('reads the host off the front of the join order', () => {
    expect(hostOf(list())).toEqual(ADA);
    expect(hostOf({ roster: [], invited: [], declined: [] })).toBeUndefined();
    expect(isHost(list(), 'u-ada')).toBe(true);
    expect(isHost(list(), 'u-sam')).toBe(false);
    expect(isHost({ roster: [], invited: [], declined: [] }, 'u-ada')).toBe(false);
  });

  it('counts open seats and never goes negative', () => {
    expect(openSeats(list(), 4)).toBe(1);
    expect(openSeats(list(), 3)).toBe(0);
    expect(openSeats(list(), 2)).toBe(0);
  });

  it('canStart at or above the minimum', () => {
    expect(canStart(list(), 4)).toBe(false);
    expect(canStart(list(), 3)).toBe(true);
    expect(canStart(list(), 2)).toBe(true);
  });

  describe('arrangedOrder', () => {
    it('shows join order for random — the real shuffle is server-side', () => {
      expect(arrangedOrder(list(), { mode: 'random' })).toEqual([ADA, SAM, LEE]);
    });

    it('puts the host at the chosen seat, everyone else in join order', () => {
      expect(arrangedOrder(list(), { mode: 'host-seat', seat: 0 })).toEqual([ADA, SAM, LEE]);
      expect(arrangedOrder(list(), { mode: 'host-seat', seat: 1 })).toEqual([SAM, ADA, LEE]);
      expect(arrangedOrder(list(), { mode: 'host-seat', seat: 2 })).toEqual([SAM, LEE, ADA]);
      // Out of range clamps rather than dropping the host.
      expect(arrangedOrder(list(), { mode: 'host-seat', seat: 9 })).toEqual([SAM, LEE, ADA]);
      expect(arrangedOrder(list(), { mode: 'host-seat', seat: -1 })).toEqual([ADA, SAM, LEE]);
    });

    it('follows a stored arrangement', () => {
      expect(arrangedOrder(list(), { mode: 'arrange', order: ['u-lee', 'u-ada', 'u-sam'] })).toEqual([
        LEE,
        ADA,
        SAM,
      ]);
    });

    it('appends a newcomer the arrangement never named, in join order', () => {
      const withKim = list({ roster: [ADA, SAM, LEE, KIM] });
      expect(arrangedOrder(withKim, { mode: 'arrange', order: ['u-lee', 'u-ada'] })).toEqual([
        LEE,
        ADA,
        SAM,
        KIM,
      ]);
    });

    it('ignores a uid that has since left', () => {
      expect(
        arrangedOrder(list(), { mode: 'arrange', order: ['u-gone', 'u-sam'] }),
      ).toEqual([SAM, ADA, LEE]);
    });
  });

  describe('moveInOrder', () => {
    const order = ['a', 'b', 'c'];

    it('moves a uid up or down', () => {
      expect(moveInOrder(order, 1, -1)).toEqual(['b', 'a', 'c']);
      expect(moveInOrder(order, 1, 1)).toEqual(['a', 'c', 'b']);
    });

    it('is a no-op at the ends and out of range', () => {
      expect(moveInOrder(order, 0, -1)).toEqual(order);
      expect(moveInOrder(order, 2, 1)).toEqual(order);
      expect(moveInOrder(order, 5, -1)).toEqual(order);
      expect(moveInOrder(order, -1, 1)).toEqual(order);
      expect(moveInOrder(order, 1, 0)).toEqual(order);
    });

    it('does not mutate its input', () => {
      const input = ['a', 'b', 'c'];
      moveInOrder(input, 0, 1);
      expect(input).toEqual(['a', 'b', 'c']);
    });
  });
});

// The regression guard for the shipped two-player games: these three testids
// and these three wire values are what lex's new-game form and its e2e spec
// click. T7.15 swaps the hand-rolled markup for this component; nothing in
// those tests may need to change.
describe('TurnOrderPicker at two seats', () => {
  it('renders exactly the legacy three toggles', () => {
    render(<TurnOrderPicker maxPlayers={2} value="me" onChange={() => {}} />);
    expect(screen.getByTestId('seat-me').textContent).toBe('You');
    expect(screen.getByTestId('seat-random').textContent).toBe('Random');
    expect(screen.getByTestId('seat-them').textContent).toBe('They do');
    expect(screen.getByTestId('seat-me').getAttribute('aria-pressed')).toBe('true');
  });

  it("emits 'me' | 'them' | 'random'", () => {
    const onChange = vi.fn();
    render(<TurnOrderPicker maxPlayers={2} value="me" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('seat-random'));
    expect(onChange).toHaveBeenCalledWith('random');
    fireEvent.click(screen.getByTestId('seat-them'));
    expect(onChange).toHaveBeenCalledWith('them');
    cleanup();
    render(<TurnOrderPicker maxPlayers={2} value="them" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('seat-me'));
    expect(onChange).toHaveBeenCalledWith('me');
  });
});

describe('TurnOrderPicker at four seats', () => {
  const four = list({ roster: [ADA, SAM, LEE, KIM] });
  const arrangeAll: TurnOrderChoice = {
    mode: 'arrange',
    order: ['u-ada', 'u-sam', 'u-lee', 'u-kim'],
  };

  it('emits an arrange choice from the up/down buttons', () => {
    const onChange = vi.fn();
    render(
      <TurnOrderPicker
        maxPlayers={4}
        value={arrangeAll}
        onChange={onChange}
        roster={four.roster}
      />,
    );
    fireEvent.click(screen.getByTestId('arrange-down-u-ada'));
    expect(onChange).toHaveBeenCalledWith({
      mode: 'arrange',
      order: ['u-sam', 'u-ada', 'u-lee', 'u-kim'],
    });
    fireEvent.click(screen.getByTestId('arrange-up-u-kim'));
    expect(onChange).toHaveBeenCalledWith({
      mode: 'arrange',
      order: ['u-ada', 'u-sam', 'u-kim', 'u-lee'],
    });
  });

  it('disables the moves that would fall off the ends', () => {
    render(
      <TurnOrderPicker maxPlayers={4} value={arrangeAll} onChange={() => {}} roster={four.roster} />,
    );
    expect(screen.getByTestId('arrange-up-u-ada').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('arrange-down-u-kim').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('arrange-down-u-ada').hasAttribute('disabled')).toBe(false);
  });

  it('offers random and a who-goes-first pick over the roster names', () => {
    const onChange = vi.fn();
    render(
      <TurnOrderPicker maxPlayers={4} value={arrangeAll} onChange={onChange} roster={four.roster} />,
    );
    fireEvent.click(screen.getByTestId('order-mode-random'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'random' });

    fireEvent.click(screen.getByTestId('order-mode-first'));
    fireEvent.click(screen.getByTestId('first-u-lee'));
    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'arrange',
      order: ['u-lee', 'u-ada', 'u-sam', 'u-kim'],
    });
  });

  it('shows no drag handles — reordering is buttons only', () => {
    const { container } = render(
      <TurnOrderPicker maxPlayers={4} value={arrangeAll} onChange={() => {}} roster={four.roster} />,
    );
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(0);
  });
});

describe('GuestListView', () => {
  it('shows how many seats are filled and separates invited from declined', () => {
    render(
      <GuestListView
        list={list({ invited: [KIM], declined: [entry('u-jo', 'Jo')] })}
        maxPlayers={4}
        myUid="u-sam"
      />,
    );
    expect(screen.getByTestId('guest-list')).toBeTruthy();
    expect(screen.getByTestId('seats-filled').textContent).toBe('3 of 4 seats filled');
    // One row per uid, in each of the three groups.
    expect(screen.getByTestId('guest-u-ada')).toBeTruthy();
    expect(screen.getByTestId('guest-u-lee')).toBeTruthy();
    expect(screen.getByTestId('invited-u-kim')).toBeTruthy();
    expect(screen.getByTestId('declined-u-jo')).toBeTruthy();
    // The host is badged, and the invitation is explicitly not a hold.
    expect(screen.getByTestId('host-badge')).toBeTruthy();
    expect(screen.getByTestId('no-reservation-note').textContent).toMatch(/don't hold a seat/i);
  });

  it('lets the host remove a guest but never themselves', () => {
    const onRemove = vi.fn();
    render(<GuestListView list={list()} maxPlayers={4} myUid="u-ada" onRemove={onRemove} />);
    expect(screen.queryByTestId('guest-remove-u-ada')).toBeNull();
    fireEvent.click(screen.getByTestId('guest-remove-u-sam'));
    expect(onRemove).toHaveBeenCalledWith('u-sam');
  });
});

describe('StartGameBar', () => {
  it('is disabled below the minimum', () => {
    render(
      <StartGameBar
        list={list({ roster: [ADA, SAM] })}
        minPlayers={3}
        maxPlayers={4}
        onStart={() => {}}
      />,
    );
    expect(screen.getByTestId('start-game').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('start-hint').textContent).toMatch(/1 more player needed/);
  });

  it('starts straight away when every seat is filled', () => {
    const onStart = vi.fn();
    render(<StartGameBar list={list()} minPlayers={2} maxPlayers={3} onStart={onStart} />);
    fireEvent.click(screen.getByTestId('start-game'));
    expect(screen.queryByTestId('start-early-confirm')).toBeNull();
    expect(onStart).toHaveBeenCalledWith(['u-ada', 'u-sam', 'u-lee']);
  });

  it('confirms an early start, naming the empty seats and who is left out', () => {
    const onStart = vi.fn();
    render(
      <StartGameBar
        list={list({ invited: [KIM] })}
        minPlayers={2}
        maxPlayers={4}
        onStart={onStart}
      />,
    );
    fireEvent.click(screen.getByTestId('start-game'));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByTestId('start-early-title').textContent).toBe('Start with 3 of 4?');
    expect(screen.getByTestId('start-early-seats').textContent).toBe('The last seat stays empty.');
    expect(screen.getByTestId('start-early-left-out').textContent).toMatch(/Still deciding: Kim/);
    // Confirming passes the CURRENT roster so the server can reject a race.
    fireEvent.click(screen.getByTestId('start-early-confirm'));
    expect(onStart).toHaveBeenCalledWith(['u-ada', 'u-sam', 'u-lee']);
  });

  it('backs out of the confirmation without starting', () => {
    const onStart = vi.fn();
    render(<StartGameBar list={list()} minPlayers={2} maxPlayers={5} onStart={onStart} />);
    fireEvent.click(screen.getByTestId('start-game'));
    expect(screen.getByTestId('start-early-seats').textContent).toBe('2 seats stay empty.');
    fireEvent.click(screen.getByTestId('start-early-cancel'));
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('GameRoom', () => {
  it('gives the host the picker and the start control', () => {
    render(
      <GameRoom
        list={list()}
        myUid="u-ada"
        minPlayers={2}
        maxPlayers={4}
        code="HK4M2XQ9"
        turnOrder={{ mode: 'random' }}
        onTurnOrderChange={() => {}}
        onStart={() => {}}
        onCancel={() => {}}
        invitePicker={<div data-testid="friend-picker" />}
      />,
    );
    expect(screen.getByTestId('game-room')).toBeTruthy();
    expect(screen.getByTestId('turn-order-picker')).toBeTruthy();
    expect(screen.getByTestId('start-game-bar')).toBeTruthy();
    expect(screen.getByTestId('invite-code').textContent).toBe('HK4M2XQ9');
    expect(screen.getByTestId('friend-picker')).toBeTruthy();
    expect(screen.getByTestId('cancel-room')).toBeTruthy();
    expect(screen.queryByTestId('leave-room')).toBeNull();
  });

  it('shows a non-host the arrangement read-only, plus Leave', () => {
    const onLeave = vi.fn();
    render(
      <GameRoom
        list={list()}
        myUid="u-lee"
        minPlayers={2}
        maxPlayers={4}
        turnOrder={{ mode: 'arrange', order: ['u-lee', 'u-ada', 'u-sam'] }}
        onTurnOrderChange={() => {}}
        onStart={() => {}}
        onLeave={onLeave}
      />,
    );
    expect(screen.queryByTestId('turn-order-picker')).toBeNull();
    expect(screen.queryByTestId('start-game-bar')).toBeNull();
    expect(screen.getByTestId('turn-order-readonly').textContent).toBe('Lee → Ada → Sam');
    fireEvent.click(screen.getByTestId('leave-room'));
    expect(onLeave).toHaveBeenCalled();
  });
});

describe('InvitationReceived', () => {
  it('shows the host, who is in, the seats left, and answers both ways', () => {
    const onRespond = vi.fn();
    render(
      <InvitationReceived
        hostName="Ada"
        names={['Ada', 'Sam']}
        filled={2}
        maxPlayers={4}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByTestId('invitation-received')).toBeTruthy();
    expect(screen.getByTestId('invitation-roster').textContent).toBe('Ada and Sam are in.');
    expect(screen.getByTestId('invitation-seats').textContent).toBe(
      '2 of 4 seats filled — 2 seats left.',
    );
    fireEvent.click(screen.getByTestId('invitation-accept'));
    expect(onRespond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByTestId('invitation-decline'));
    expect(onRespond).toHaveBeenCalledWith(false);
  });

  it('cannot accept a full room', () => {
    render(
      <InvitationReceived
        hostName="Ada"
        names={['Ada', 'Sam', 'Lee']}
        filled={3}
        maxPlayers={3}
        onRespond={() => {}}
      />,
    );
    expect(screen.getByTestId('invitation-seats').textContent).toBe('All 3 seats are taken.');
    expect(screen.getByTestId('invitation-accept').hasAttribute('disabled')).toBe(true);
  });
});

describe('JoinCard closed state', () => {
  it('says the code was fine and the game is full', () => {
    render(<JoinCard state={{ kind: 'closed' }} onAccept={() => {}} />);
    expect(screen.getByTestId('join-closed').textContent).toMatch(/This game is full/);
    expect(screen.getByTestId('join-closed').textContent).toMatch(/code was good/);
    expect(screen.queryByTestId('join-accept')).toBeNull();
  });
});
