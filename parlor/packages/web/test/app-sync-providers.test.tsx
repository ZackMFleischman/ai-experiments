// @vitest-environment jsdom
// T4.1: the full-mode provider — auth state flow into AuthContext and the
// emulator-only test-account path, with firebase/auth mocked.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (u: { uid: string; displayName: string | null } | null) => void;
let authCallback: AuthCallback | undefined;
const { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } = vi.hoisted(
  () => ({
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    updateProfile: vi.fn(),
  }),
);

afterEach(cleanup);

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: AuthCallback) => {
    authCallback = cb;
    return () => {};
  },
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut: vi.fn(),
}));

const usingEmulators = vi.fn(() => true);
vi.mock('../src/firebase', () => ({
  getAppAuth: () => ({ kind: 'auth' }),
  usingEmulators: () => usingEmulators(),
}));

import AppSyncProviders from '../src/AppSyncProviders';
import { useAuth, type AuthValue } from '../src/authContext';

let seen: AuthValue | undefined;
function Probe() {
  seen = useAuth();
  return <div>{seen.loading ? 'loading' : (seen.user?.displayName ?? 'signed-out')}</div>;
}

beforeEach(() => {
  authCallback = undefined;
  seen = undefined;
  usingEmulators.mockReturnValue(true);
  signInWithEmailAndPassword.mockReset();
  createUserWithEmailAndPassword.mockReset();
  updateProfile.mockReset();
});

function renderProvider() {
  return render(
    <AppSyncProviders>
      <Probe />
    </AppSyncProviders>,
  );
}

describe('AppSyncProviders', () => {
  it('starts loading, then reflects the firebase auth state', async () => {
    renderProvider();
    expect(screen.getByText('loading')).toBeTruthy();
    await act(async () => {
      authCallback?.({ uid: 'u1', displayName: 'Ada' });
    });
    expect(seen?.mode).toBe('full');
    expect(seen?.user).toMatchObject({ uid: 'u1', displayName: 'Ada' });
    expect(seen?.loading).toBe(false);
  });

  it('reports signed-out when firebase yields no user', async () => {
    renderProvider();
    await act(async () => {
      authCallback?.(null);
    });
    expect(screen.getByText('signed-out')).toBeTruthy();
  });

  it('signs into an existing test account via email/password', async () => {
    renderProvider();
    await act(async () => {
      authCallback?.(null);
    });
    await act(async () => {
      await seen?.signInWithTestAccount('ada@example.com');
    });
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'ada@example.com',
      expect.any(String),
    );
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('creates the test account (with display name) on first use', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce(new Error('no such user'));
    createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'u2', displayName: null, photoURL: null, email: 'sam@example.com' },
    });
    renderProvider();
    await act(async () => {
      authCallback?.(null);
    });
    await act(async () => {
      await seen?.signInWithTestAccount('sam@example.com');
    });
    expect(createUserWithEmailAndPassword).toHaveBeenCalled();
    expect(updateProfile).toHaveBeenCalledWith(expect.anything(), { displayName: 'sam' });
  });

  it('refuses test accounts outside emulator mode', async () => {
    usingEmulators.mockReturnValue(false);
    renderProvider();
    await act(async () => {
      authCallback?.(null);
    });
    await expect(seen?.signInWithTestAccount('ada@example.com')).rejects.toThrow(/emulator/);
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});
