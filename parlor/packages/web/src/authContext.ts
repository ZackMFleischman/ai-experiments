// ported from hive/packages/app/src/sync/authContext.ts (adapted)
// Auth seam. This module is firebase-free on purpose: screens read auth
// through this context, and only the lazy full-mode provider (AppSyncProviders)
// ever imports the firebase SDK — that's what keeps a consumer's static
// hot-seat bundle clean.
import { createContext, useContext } from 'react';

export interface AppUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
}

export interface AuthValue {
  mode: 'hotseat' | 'full';
  /** True when talking to the local emulator suite (dev / e2e). */
  emulators: boolean;
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle(): Promise<void>;
  /** Emulator-only test account sign-in (creates the user on first use). */
  signInWithTestAccount(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const noop = async () => {};

/** Default context value: a static hot-seat build has no auth at all. */
export const HOTSEAT_AUTH: AuthValue = {
  mode: 'hotseat',
  emulators: false,
  user: null,
  loading: false,
  signInWithGoogle: noop,
  signInWithTestAccount: noop,
  signOut: noop,
};

export const AuthContext = createContext<AuthValue>(HOTSEAT_AUTH);

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
