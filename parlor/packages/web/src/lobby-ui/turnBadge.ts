// ported from hive/packages/app/src/screens/turnBadge.ts (adapted)
// In-app turn awareness: works even with push denied — document title
// "(n) GAME" plus the app icon badge where the Badging API exists. The base
// title is the game's (makeTurnBadge); the count arithmetic is shared
// (actionableCount in ./summary). Firebase-free.
import { useEffect } from 'react';

export function applyTurnBadge(count: number, baseTitle: string): void {
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
}

/** Binds the document/icon badge to a game's base title. Returns a `useTurnBadge`
 * hook the game's lobby feeds its actionable count. */
export function makeTurnBadge(baseTitle: string): (count: number) => void {
  return function useTurnBadge(count: number): void {
    useEffect(() => {
      applyTurnBadge(count, baseTitle);
      return () => applyTurnBadge(0, baseTitle);
    }, [count]);
  };
}
