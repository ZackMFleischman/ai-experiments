// In-app turn awareness (T5.4, DESIGN §7): works even with push denied —
// document title "(n) HIVE" plus the app icon badge where the Badging API
// exists. Firebase-free; the full-mode lobby feeds it the actionable count.
import { useEffect } from 'react';
import type { LobbyGameSummary } from './lobbyView';

const BASE_TITLE = 'HIVE';

/** What the badge counts: games on my move, incoming challenges, and fresh
 * opponent-activated games. Must stay in step with the server's
 * countActionable (functions/src/notify.ts) — the push carries the same
 * number for the closed-app icon badge. */
export function actionableCount(games: LobbyGameSummary[]): number {
  return games.filter(
    (g) =>
      (g.status === 'active' && g.toMove === g.myColor) ||
      (g.status === 'open' && g.challenge?.direction === 'incoming') ||
      g.freshFromOpponent === true,
  ).length;
}

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
