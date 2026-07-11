// Hot-seat session: LogSession over the storage-backed local transport —
// the in-progress game survives refresh; "new game" is a reset. The static
// PWA ships only this path (check-bundle.mjs keeps it firebase-free).
import { LogSession, LocalStorageTransport, type KeyValueStorage } from '@parlor/core';
import type { CheckersState } from '@checkers/engine';
import { DEFAULT_OPTIONS, type CheckersGameOptions } from '../gameOptions';
import { sessionConfig, type CheckersEntry } from './entries';

export type CheckersSession = LogSession<CheckersGameOptions, CheckersEntry, CheckersState>;

export async function createLocalSession(
  storage: KeyValueStorage = window.localStorage,
): Promise<CheckersSession> {
  const transport = new LocalStorageTransport<CheckersGameOptions, CheckersEntry>(
    DEFAULT_OPTIONS,
    'checkers:local',
    storage,
  );
  const session = new LogSession(transport, sessionConfig);
  await session.init();
  return session;
}
