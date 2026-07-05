// T6.2 gate: polish pass — typographic minus on negative scores, the rejected-
// move notice actually surfaces as a toast, and the lobby empty state invites.
// Plus the real-device round: header fits 390px (sign-out moved to Settings),
// labeled New-game FAB, and a primary CTA in the empty state.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, HOTSEAT_AUTH, type AuthValue } from '@parlor/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../src/App';
import { NoticeToast } from '../src/game/NoticeToast';
import { ResultOverlay } from '../src/game/ResultOverlay';
import { formatScore } from '../src/game/score';
import { Lobby } from '../src/screens/Lobby';
import { LobbyView } from '../src/screens/lobbyView';
import { Settings } from '../src/screens/Settings';

afterEach(cleanup);

const noop = () => {};
const anoop = async () => {};

const SIGNED_IN: AuthValue = {
  mode: 'full',
  emulators: false,
  user: { uid: 'u1', displayName: 'Zachary Fleischman', photoURL: null, email: 'z@example.com' },
  loading: false,
  signInWithGoogle: anoop,
  signInWithTestAccount: anoop,
  signOut: anoop,
};

function withAuth(node: React.ReactNode, auth: AuthValue) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <AppProviders>{node}</AppProviders>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('formatScore', () => {
  it('renders negatives with a typographic minus (U+2212), never hyphen-minus', () => {
    expect(formatScore(-7)).toBe('−7');
    expect(formatScore(0)).toBe('0');
    expect(formatScore(212)).toBe('212');
  });
});

describe('ResultOverlay score typography', () => {
  it('uses the minus sign in a negative draw headline and the score rows', () => {
    render(
      <ResultOverlay
        open
        end={{ by: 'scoreless', winner: 'draw', finalScores: [-7, -7], adjustments: [-7, -7] }}
        names={['Player 1', 'Player 2']}
        sheet={[]}
        onRematch={noop}
        onViewBoard={noop}
      />,
    );
    const overlay = screen.getByTestId('result-overlay');
    expect(overlay.textContent).toContain('Draw — −7 apiece');
    expect(overlay.textContent).not.toContain('-7'); // no hyphen-minus anywhere
  });
});

describe('NoticeToast', () => {
  it('surfaces the controller notice and dismisses on close', async () => {
    const { rerender } = render(<NoticeToast notice={{ id: 1, text: 'Move rejected — undone.' }} />);
    expect(screen.getByTestId('notice-toast').textContent).toContain('Move rejected');
    fireEvent.click(screen.getByLabelText(/close/i));
    // The Snackbar exit transition keeps the node mounted briefly.
    await waitFor(() => expect(screen.queryByTestId('notice-toast')).toBeNull());
    // A NEW notice (fresh id) must reappear after a dismissal.
    rerender(<NoticeToast notice={{ id: 2, text: 'Move rejected — undone.' }} />);
    expect(screen.getByTestId('notice-toast')).toBeTruthy();
  });

  it('renders nothing without a notice', () => {
    render(<NoticeToast notice={undefined} />);
    expect(screen.queryByTestId('notice-toast')).toBeNull();
  });
});

describe('lobby empty state', () => {
  it('is a real empty state: headline + invite copy, not a bare line', () => {
    render(<LobbyView games={[]} now={0} onOpen={noop} />);
    const empty = screen.getByTestId('lobby-empty');
    expect(empty.textContent).toContain('No games yet');
    expect(empty.textContent).toMatch(/invite/i);
  });

  it('carries a primary Start-a-new-game CTA when the container wires one', () => {
    const onNewGame = vi.fn();
    render(<LobbyView games={[]} now={0} onOpen={noop} onNewGame={onNewGame} />);
    fireEvent.click(screen.getByRole('button', { name: /start a new game/i }));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});

describe('lobby header (fits 390px)', () => {
  it('shows the identity chip but NOT sign-out — that moved to Settings', () => {
    withAuth(<Lobby />, SIGNED_IN);
    expect(screen.getByTestId('lobby-user').textContent).toContain('Zachary Fleischman');
    expect(screen.queryByTestId('sign-out')).toBeNull();
  });

  it('the new-game FAB is a labeled link, not a bare +', () => {
    withAuth(<Lobby />, SIGNED_IN);
    const fab = screen.getByRole('link', { name: /new game/i });
    expect(fab.textContent).toContain('New game');
  });
});

describe('Settings account section', () => {
  it('shows the signed-in identity with a working sign-out', () => {
    const signOut = vi.fn(async () => {});
    withAuth(<Settings />, { ...SIGNED_IN, signOut });
    expect(screen.getByTestId('account-user').textContent).toContain('Zachary Fleischman');
    fireEvent.click(screen.getByTestId('sign-out'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('hides the account section entirely in the hot-seat build', () => {
    withAuth(<Settings />, HOTSEAT_AUTH);
    expect(screen.queryByTestId('account-user')).toBeNull();
    expect(screen.queryByTestId('sign-out')).toBeNull();
  });
});
