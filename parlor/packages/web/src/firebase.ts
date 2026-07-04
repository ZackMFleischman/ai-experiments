// ported from hive/packages/app/src/sync/firebase.ts (adapted)
// Firebase app singleton. Loaded only from a consumer's full-mode lazy chunk —
// never from a static hot-seat build. In dev/e2e everything points at the
// emulator suite; production reads the consumer's committed VITE_FIREBASE_*
// identifiers. The consumer calls `configureFirebase` (emulator project id is
// game-specific) before the first getter.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

// Vite injects import.meta.env; accessed via a cast so parlor compiles without
// vite/client ambient types (the consumer's bundler provides the values).
const env: Record<string, string | boolean | undefined> =
  (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};

export interface ParlorFirebaseOptions {
  /** Must match the consumer's `firebase emulators:start --project <id>` — callable URLs include it. */
  emulatorProjectId: string;
  /** Override emulator detection (default: DEV build or VITE_FIREBASE_EMULATORS === '1'). */
  emulators?: boolean;
}

let options: ParlorFirebaseOptions | undefined;
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let fns: Functions | undefined;

export function configureFirebase(opts: ParlorFirebaseOptions): void {
  options = opts;
}

function getOptions(): ParlorFirebaseOptions {
  if (!options) {
    throw new Error('configureFirebase(...) must run before any @parlor/web firebase getter');
  }
  return options;
}

export function usingEmulators(): boolean {
  const opts = getOptions();
  return opts.emulators ?? (env.DEV === true || env.VITE_FIREBASE_EMULATORS === '1');
}

function buildConfig() {
  return usingEmulators()
    ? {
        apiKey: 'demo',
        authDomain: '127.0.0.1',
        projectId: getOptions().emulatorProjectId,
        appId: 'demo',
      }
    : {
        apiKey: env.VITE_FIREBASE_API_KEY as string,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
        projectId: env.VITE_FIREBASE_PROJECT_ID as string,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
        appId: env.VITE_FIREBASE_APP_ID as string,
      };
}

export function getApp(): FirebaseApp {
  app ??= initializeApp(buildConfig());
  return app;
}

export function getAppAuth(): Auth {
  if (!auth) {
    auth = getAuth(getApp());
    if (usingEmulators()) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return auth;
}

export function getDb(): Firestore {
  if (!db) {
    // Emulator + headless-browser WebChannel streams can 400 and flip the SDK
    // into offline mode (breaks getDoc/onSnapshot in e2e) — force long polling
    // there. Production keeps the default transport.
    // Persistent local cache: the lobby renders cached games read-only offline.
    db = initializeFirestore(getApp(), {
      // IndexedDB exists in browsers only — node-side tests keep memory cache.
      ...(typeof indexedDB !== 'undefined'
        ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
        : {}),
      ...(usingEmulators() ? { experimentalForceLongPolling: true } : {}),
    });
    if (usingEmulators()) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return db;
}

export function getFns(): Functions {
  if (!fns) {
    fns = getFunctions(getApp());
    if (usingEmulators()) connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }
  return fns;
}
