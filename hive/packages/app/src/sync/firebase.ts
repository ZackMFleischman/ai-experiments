// Firebase app singleton (T4.1). Loaded only from the full-mode lazy chunk —
// never from the static hot-seat build. In dev/e2e everything points at the
// emulator suite (DESIGN §5.5); production reads the committed VITE_FIREBASE_*
// identifiers (DESIGN §5.6).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

export const usingEmulators =
  import.meta.env.DEV || import.meta.env.VITE_FIREBASE_EMULATORS === '1';

// The emulator project must match --project demo-hive (callable URLs include it).
const config = usingEmulators
  ? { apiKey: 'demo', authDomain: '127.0.0.1', projectId: 'demo-hive', appId: 'demo' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let fns: Functions | undefined;

export function getApp(): FirebaseApp {
  app ??= initializeApp(config);
  return app;
}

export function getAppAuth(): Auth {
  if (!auth) {
    auth = getAuth(getApp());
    if (usingEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return auth;
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getApp());
    if (usingEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return db;
}

export function getFns(): Functions {
  if (!fns) {
    fns = getFunctions(getApp());
    if (usingEmulators) connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }
  return fns;
}
