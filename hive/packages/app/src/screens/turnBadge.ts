// In-app turn awareness (T5.4, DESIGN §7): works even with push denied —
// document title "(n) HIVE" plus the app icon badge where the Badging API
// exists. Firebase-free; the full-mode lobby feeds it the your-turn count.
import { useEffect } from 'react';

const BASE_TITLE = 'HIVE';

export function applyTurnBadge(count: number): void {
  document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
}

export function useTurnBadge(count: number): void {
  useEffect(() => {
    applyTurnBadge(count);
    return () => applyTurnBadge(0);
  }, [count]);
}
