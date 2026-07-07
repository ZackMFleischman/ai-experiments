// Landing gates the boot flow: while full-mode auth is still resolving it
// shows the branded LEX loading screen (not the sign-in buttons, which would
// flash for an already-signed-in player); once resolved it either signs in or
// redirects to the lobby.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthContext, type AuthValue } from '@parlor/web';
import { AppProviders } from '../src/App';
import { Landing } from '../src/screens/Landing';

afterEach(cleanup);

const noop = async () => {};

function fullAuth(overrides: Partial<AuthValue> = {}): AuthValue {
  return {
    mode: 'full',
    emulators: false,
    user: null,
    loading: false,
    signInWithGoogle: noop,
    signInWithTestAccount: noop,
    signOut: noop,
    ...overrides,
  };
}

function renderLanding(auth: AuthValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/']}>
        <AppProviders>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/lobby" element={<div>lobby</div>} />
          </Routes>
        </AppProviders>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('Landing boot flow', () => {
  it('shows the LEX loading screen while full-mode auth resolves', () => {
    renderLanding(fullAuth({ loading: true }));
    expect(screen.getByTestId('landing-loading')).toBeTruthy();
    // The branded hero is up — no sign-in button flash.
    expect(screen.getByTestId('landing-hero')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });

  it('shows the sign-in button once resolved to signed-out', () => {
    renderLanding(fullAuth());
    expect(screen.queryByTestId('landing-loading')).toBeNull();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('redirects a signed-in player to their games', () => {
    renderLanding(
      fullAuth({
        user: { uid: 'u1', displayName: 'Ada', photoURL: null, email: 'ada@example.com' },
      }),
    );
    expect(screen.getByText('lobby')).toBeTruthy();
    expect(screen.queryByTestId('landing-loading')).toBeNull();
  });
});
