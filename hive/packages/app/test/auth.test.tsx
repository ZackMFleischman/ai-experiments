// T4.1: auth context + route guards. The screens are mode-aware through
// AuthContext; these tests inject fake auth values — the real firebase-backed
// provider (sync/AppSyncProviders) is exercised by the emulator e2e.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders, AppRoutes } from '../src/App';
import { AuthContext, HOTSEAT_AUTH, type AuthValue } from '../src/sync/authContext';

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

function renderAt(path: string, auth: AuthValue) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('auth route guards (full mode)', () => {
  it('shows a loading state on guarded routes while auth resolves', () => {
    renderAt('/lobby', fullAuth({ loading: true }));
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('redirects signed-out users from /lobby to the landing sign-in', () => {
    renderAt('/lobby', fullAuth());
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeTruthy();
  });

  it('renders the lobby for signed-in users', () => {
    renderAt(
      '/lobby',
      fullAuth({ user: { uid: 'u1', displayName: 'Ada', photoURL: null, email: 'ada@example.com' } }),
    );
    expect(screen.getByRole('heading', { level: 1, name: /your games/i })).toBeTruthy();
    expect(screen.getByText(/ada/i)).toBeTruthy();
  });

  it('sends a signed-in visitor from the landing straight to the lobby', () => {
    renderAt(
      '/',
      fullAuth({ user: { uid: 'u1', displayName: 'Ada', photoURL: null, email: null } }),
    );
    expect(screen.getByRole('heading', { level: 1, name: /your games/i })).toBeTruthy();
  });

  it('leaves the hot-seat game unguarded when signed out', async () => {
    renderAt('/game/local', fullAuth());
    expect(await screen.findByTestId('hand-tray')).toBeTruthy();
  });

  it('offers the test sign-in form only against emulators', () => {
    renderAt('/', fullAuth({ emulators: true }));
    expect(screen.getByLabelText(/test account email/i)).toBeTruthy();
  });

  it('hides the test sign-in form in production mode', () => {
    renderAt('/', fullAuth({ emulators: false }));
    expect(screen.queryByLabelText(/test account email/i)).toBeNull();
  });
});

describe('hot-seat mode (default context)', () => {
  it('keeps the landing Play flow with no auth', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /play/i })).toBeTruthy();
    expect(HOTSEAT_AUTH.mode).toBe('hotseat');
  });

  it('keeps /lobby unguarded', () => {
    render(
      <MemoryRouter initialEntries={['/lobby']}>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: /your games/i })).toBeTruthy();
  });
});
