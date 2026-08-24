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
          options: {
            rulesetId: 'modern',
            dictionaryId: 'enable1',
            timeControl: { days: 7 },
            invalidWords: 'blocked',
          },
        }}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByText(/Ada invited you to a game/)).toBeTruthy();
    expect(screen.getByText(/You.ll go second/)).toBeTruthy(); // host is p0
    expect(screen.getByText(/Modern board/)).toBeTruthy();
    expect(screen.getByText(/Tournament-style · 173k words/)).toBeTruthy();
    expect(screen.getByText(/7 days per move/)).toBeTruthy();
    // The default rule is not chipped at all — absent, not present-and-off.
    expect(screen.queryByTestId('join-invalid-words')).toBeNull();
  });

  it('warns the invitee when the host chose invalid-words-cost-your-turn (FR-10)', () => {
    render(
      <JoinCard
        state={{
          kind: 'ready',
          hostName: 'Ada',
          hostSeat: 'p0',
          options: {
            rulesetId: 'classic',
            dictionaryId: 'enable1',
            timeControl: null,
            invalidWords: 'costs-turn',
          },
        }}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId('join-invalid-words').textContent).toMatch(/cost your turn/i);
  });

  it('accepts through the callback; invalid invites say so', () => {
    const onAccept = vi.fn();
    const { unmount } = render(
      <JoinCard
        state={{
          kind: 'ready',
          hostName: 'Ada',
          hostSeat: 'p1',
          options: {
            rulesetId: 'classic',
            dictionaryId: '2of12inf',
            timeControl: null,
            invalidWords: 'blocked',
          },
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
