// @vitest-environment jsdom
// T4.1: the firebase-free auth seam — context defaults and the route guard.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import { AuthContext, HOTSEAT_AUTH, type AuthValue } from '../src/authContext';
import { RequireAuth } from '../src/RequireAuth';

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

function renderGuarded(auth: AuthValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/lobby']}>
        <Routes>
          <Route path="/" element={<div>landing</div>} />
          <Route
            path="/lobby"
            element={
              <RequireAuth>
                <div>guarded content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('HOTSEAT_AUTH default context', () => {
  it('is a no-auth hot-seat value', () => {
    expect(HOTSEAT_AUTH.mode).toBe('hotseat');
    expect(HOTSEAT_AUTH.user).toBeNull();
    expect(HOTSEAT_AUTH.loading).toBe(false);
    expect(HOTSEAT_AUTH.emulators).toBe(false);
  });
});

describe('RequireAuth', () => {
  it('renders children as-is in hot-seat mode', () => {
    renderGuarded(HOTSEAT_AUTH);
    expect(screen.getByText('guarded content')).toBeTruthy();
  });

  it('shows a loading state while full-mode auth resolves', () => {
    renderGuarded(fullAuth({ loading: true }));
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText('guarded content')).toBeNull();
  });

  it('redirects signed-out full-mode users to the landing route', () => {
    renderGuarded(fullAuth());
    expect(screen.getByText('landing')).toBeTruthy();
    expect(screen.queryByText('guarded content')).toBeNull();
  });

  it('renders children for signed-in full-mode users', () => {
    renderGuarded(
      fullAuth({
        user: { uid: 'u1', displayName: 'Ada', photoURL: null, email: 'ada@example.com' },
      }),
    );
    expect(screen.getByText('guarded content')).toBeTruthy();
  });
});
