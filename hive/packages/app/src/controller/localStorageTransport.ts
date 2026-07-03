// Hot-seat persistence (T3.11): the in-progress game (options + UHP/meta log)
// survives refresh via localStorage, entirely behind the GameTransport seam.
import type { GameOptions } from '@hive/engine';
import { LocalTransport, type StoredGame } from './transport';

const STORAGE_KEY = 'hive.hotseat.v1';

export class LocalStorageTransport extends LocalTransport {
  constructor(defaultOptions: GameOptions, private readonly storage: Storage = window.localStorage) {
    super(defaultOptions);
    // The base constructor ran restore() before `storage` was assigned (class
    // field init order) — restore again now that it is.
    const stored = this.restoreFrom(storage);
    if (stored) this.game = stored;
  }

  protected override persist(): void {
    try {
      this.storageOrNull()?.setItem(STORAGE_KEY, JSON.stringify(this.game));
    } catch {
      // Quota/permissions: play continues, it just won't survive a refresh.
    }
  }

  protected override restore(): StoredGame | null {
    return null; // handled in the constructor once `storage` exists
  }

  private restoreFrom(storage: Storage): StoredGame | null {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredGame;
      if (!parsed || !Array.isArray(parsed.log) || typeof parsed.options !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private storageOrNull(): Storage | null {
    try {
      return this.storage;
    } catch {
      return null;
    }
  }
}
