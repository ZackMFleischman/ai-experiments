// Hot-seat session: LogSession over the storage-backed local transport —
// the in-progress game survives refresh; "new game" is a reset. The static
// PWA ships only this path (check-bundle.mjs keeps it firebase-free).
import { LogSession, LocalStorageTransport, type KeyValueStorage } from '@parlor/core';
import type { TaflState } from '@tafl/engine';
import { DEFAULT_OPTIONS, type TaflGameOptions } from '../gameOptions';
import { sessionConfig, type TaflEntry } from './entries';

export type TaflSession = LogSession<TaflGameOptions, TaflEntry, TaflState>;

export async function createLocalSession(
  storage: KeyValueStorage = window.localStorage,
): Promise<TaflSession> {
  const transport = new LocalStorageTransport<TaflGameOptions, TaflEntry>(
    DEFAULT_OPTIONS,
    'tafl:local',
    storage,
  );
  const session = new LogSession(transport, sessionConfig);
  await session.init();
  return session;
}
