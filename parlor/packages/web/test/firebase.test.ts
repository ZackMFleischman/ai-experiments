// T4.1: firebase singleton config — configureFirebase is mandatory, the
// emulator project id is injected, and emulator connectors fire exactly when
// emulator mode is on. SDK modules are mocked; module state is reset per test.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const initializeApp = vi.fn((config: unknown) => ({ config }));
const connectAuthEmulator = vi.fn();
const connectFirestoreEmulator = vi.fn();
const connectFunctionsEmulator = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ kind: 'auth' })),
  connectAuthEmulator,
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn((_app: unknown, settings: unknown) => ({ kind: 'db', settings })),
  connectFirestoreEmulator,
  persistentLocalCache: vi.fn((v: unknown) => v),
  persistentMultipleTabManager: vi.fn(() => ({})),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({ kind: 'fns' })),
  connectFunctionsEmulator,
}));

async function freshModule() {
  vi.resetModules();
  return import('../src/firebase');
}

beforeEach(() => {
  initializeApp.mockClear();
  connectAuthEmulator.mockClear();
  connectFirestoreEmulator.mockClear();
  connectFunctionsEmulator.mockClear();
});

describe('configureFirebase', () => {
  it('is required before any getter', async () => {
    const fb = await freshModule();
    expect(() => fb.getApp()).toThrow(/configureFirebase/);
  });

  it('uses the injected emulator project id in emulator mode', async () => {
    const fb = await freshModule();
    fb.configureFirebase({ emulatorProjectId: 'demo-testgame', emulators: true });
    fb.getApp();
    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'demo-testgame' }),
    );
  });

  it('connects auth, firestore, and functions emulators in emulator mode', async () => {
    const fb = await freshModule();
    fb.configureFirebase({ emulatorProjectId: 'demo-testgame', emulators: true });
    fb.getAppAuth();
    fb.getDb();
    fb.getFns();
    expect(connectAuthEmulator).toHaveBeenCalledWith(
      expect.anything(),
      'http://127.0.0.1:9099',
      { disableWarnings: true },
    );
    expect(connectFirestoreEmulator).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 8080);
    expect(connectFunctionsEmulator).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 5001);
  });

  it('forces long polling on the emulator firestore (headless WebChannel fix)', async () => {
    const fb = await freshModule();
    fb.configureFirebase({ emulatorProjectId: 'demo-testgame', emulators: true });
    const db = fb.getDb() as unknown as { settings: Record<string, unknown> };
    expect(db.settings.experimentalForceLongPolling).toBe(true);
  });

  it('skips every emulator connector when emulators are off', async () => {
    const fb = await freshModule();
    fb.configureFirebase({ emulatorProjectId: 'demo-testgame', emulators: false });
    fb.getAppAuth();
    fb.getDb();
    fb.getFns();
    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(connectFunctionsEmulator).not.toHaveBeenCalled();
    const db = fb.getFns();
    expect(db).toBeTruthy();
  });

  it('memoizes the app singleton', async () => {
    const fb = await freshModule();
    fb.configureFirebase({ emulatorProjectId: 'demo-testgame', emulators: true });
    expect(fb.getApp()).toBe(fb.getApp());
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });
});
