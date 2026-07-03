// Full-mode provider stack (T4.1): the only component that touches the
// firebase SDK, loaded lazily by App.tsx when VITE_HIVE_MODE=full. Auth state
// flows to the screens through AuthContext.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getAppAuth, usingEmulators } from './firebase';
import { AuthContext, type AppUser, type AuthValue } from './authContext';

// One shared throwaway password: the auth emulator holds no real accounts.
const TEST_PASSWORD = 'hive-test-password';

const queryClient = new QueryClient();

function toAppUser(u: User): AppUser {
  return { uid: u.uid, displayName: u.displayName, photoURL: u.photoURL, email: u.email };
}

export default function AppSyncProviders({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(getAppAuth(), (u) => {
      setUser(u ? toAppUser(u) : null);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      mode: 'full',
      emulators: usingEmulators,
      user,
      loading,
      async signInWithGoogle() {
        await signInWithPopup(getAppAuth(), new GoogleAuthProvider());
      },
      async signInWithTestAccount(email: string) {
        if (!usingEmulators) throw new Error('test accounts exist only on the emulator');
        const auth = getAppAuth();
        try {
          await signInWithEmailAndPassword(auth, email, TEST_PASSWORD);
        } catch {
          const cred = await createUserWithEmailAndPassword(auth, email, TEST_PASSWORD);
          await updateProfile(cred.user, { displayName: email.split('@')[0] ?? email });
          // Re-read so the context sees the display name immediately.
          setUser(toAppUser(cred.user));
        }
      },
      async signOut() {
        await firebaseSignOut(getAppAuth());
      },
    }),
    [user, loading],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}
