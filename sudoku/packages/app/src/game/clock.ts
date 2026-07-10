// Per-game elapsed clock, persisted so a refresh (or app kill) never loses
// the time. One record keyed by the game's seed; ticking is UI-side.
import type { KeyValueStorage } from '@parlor/solo';

interface StoredClock {
  gameKey: string;
  elapsedMs: number;
}

const KEY = 'sudoku:clock';

export function loadElapsed(storage: KeyValueStorage, gameKey: string): number {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as StoredClock;
    return parsed.gameKey === gameKey && typeof parsed.elapsedMs === 'number' ? parsed.elapsedMs : 0;
  } catch {
    return 0;
  }
}

export function saveElapsed(storage: KeyValueStorage, gameKey: string, elapsedMs: number): void {
  try {
    storage.setItem(KEY, JSON.stringify({ gameKey, elapsedMs } satisfies StoredClock));
  } catch {
    // Losing the clock never interrupts play.
  }
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
