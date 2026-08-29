// T4.7: the join summary card (FR-10 — board, dictionary, time control, and
// seat BEFORE accepting) and the waiting/challenge screens (§8.10).
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { JoinCard } from '../src/screens/Join';
import { ChallengeReceived, WaitingForOpponent } from '../src/screens/waitingView';

describe('JoinCard (FR-10)', () => {
  it('lists board, dictionary + word count, time control, and my seat', () => {
    render(
      <JoinCard
        state={{
          kind: 'ready',
          hostName: 'Ada',
          hostSeat: 'p0',
          options: { rulesetId: 'modern', dictionaryId: 'enable1', timeControl: { days: 7 } },
        }}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByText(/Ada invited you to a game/)).toBeTruthy();
    expect(screen.getByText(/You.ll go second/)).toBeTruthy(); // host is p0
    expect(screen.getByText(/Modern board/)).toBeTruthy();
    expect(screen.getByText(/Tournament-style · 173k words/)).toBeTruthy();
    expect(screen.getByText(/7 days per move/)).toBeTruthy();
  });

  it('accepts through the callback; invalid invites say so', () => {
    const onAccept = vi.fn();
    const { unmount } = render(
      <JoinCard
        state={{
          kind: 'ready',
          hostName: 'Ada',
          hostSeat: 'p1',
          options: { rulesetId: 'classic', dictionaryId: '2of12inf', timeControl: null },
        }}
        onAccept={onAccept}
      />,
    );
    expect(screen.getByText(/You.ll go first/)).toBeTruthy();
    expect(screen.getByText(/No clock/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('join-accept'));
    expect(onAccept).toHaveBeenCalled();
    unmount();

    render(<JoinCard state={{ kind: 'invalid' }} onAccept={() => {}} />);
    expect(screen.getByText(/no longer valid/)).toBeTruthy();
  });
});

// T7.15: the same code, but it opens a ROOM. There is no seat to promise yet,
// so the card leads with who is already in and how many places are left.
describe('JoinCard — a 3+ room', () => {
  const room = {
    kind: 'room' as const,
    hostName: 'Ada',
    names: ['Ada', 'Sam'],
    filled: 2,
    maxPlayers: 4,
    options: { rulesetId: 'classic', dictionaryId: 'nwl2023', timeControl: { days: 3 as const } },
  };

  it('previews the guest list, the open places and the options', () => {
    const onAccept = vi.fn();
    render(<JoinCard state={room} onAccept={onAccept} />);
    expect(screen.getByTestId('join-roster').textContent).toBe('Ada and Sam are in.');
    expect(screen.getByTestId('join-seats').textContent).toBe(
      '2 of 4 seats filled — 2 seats left.',
    );
    expect(screen.getByText(/Classic board/)).toBeTruthy();
    expect(screen.getByText(/3 days per move/)).toBeTruthy();
    // No seat exists before the start, so the card must promise none.
    expect(screen.queryByText(/You.ll go/)).toBeNull();
    fireEvent.click(screen.getByTestId('join-accept'));
    expect(onAccept).toHaveBeenCalled();
  });

  it('says the host is alone when nobody else has joined', () => {
    render(<JoinCard state={{ ...room, names: ['Ada'], filled: 1 }} onAccept={() => {}} />);
    expect(screen.getByTestId('join-roster').textContent).toMatch(/first to join/);
    expect(screen.getByTestId('join-seats').textContent).toBe(
      '1 of 4 seats filled — 3 seats left.',
    );
  });

  it('a full room is closed, not invalid — the code was never wrong', () => {
    render(<JoinCard state={{ kind: 'closed' }} onAccept={() => {}} />);
    expect(screen.getByTestId('join-closed')).toBeTruthy();
    expect(screen.getByText(/This game is full/)).toBeTruthy();
    expect(screen.queryByText(/no longer valid/)).toBeNull();
    expect(screen.queryByTestId('join-accept')).toBeNull();
  });
});

describe('WaitingForOpponent (§8.10 — board withheld while open)', () => {
  it('keeps the invite re-shareable as link AND code', () => {
    render(
      <MemoryRouter>
        <WaitingForOpponent code="ABCD2345" onCancel={() => {}} />
      </MemoryRouter>,
    );
    expect((screen.getByTestId('invite-url') as HTMLInputElement).value).toContain(
      '/join/ABCD2345',
    );
    expect(screen.getByTestId('invite-code').textContent).toBe('ABCD2345');
    expect(screen.getByTestId('cancel-invite').textContent).toMatch(/cancel invite/i);
  });

  it('shows the outbound-challenge variant with a withdraw action', () => {
    const onCancel = vi.fn();
    render(
      <MemoryRouter>
        <WaitingForOpponent challengeName="Sam" onCancel={onCancel} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Waiting for Sam/)).toBeTruthy();
    const cancel = screen.getByTestId('cancel-invite');
    expect(cancel.textContent).toMatch(/withdraw challenge/i);
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ChallengeReceived', () => {
  it('accepts or declines the seat', () => {
    const onRespond = vi.fn();
    render(
      <MemoryRouter>
        <ChallengeReceived name="Ada" onRespond={onRespond} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Ada challenges you/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('challenge-accept'));
    expect(onRespond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByTestId('challenge-decline'));
    expect(onRespond).toHaveBeenCalledWith(false);
  });
});
