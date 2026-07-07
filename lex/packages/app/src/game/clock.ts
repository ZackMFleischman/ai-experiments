// Async move-clock formatting + a slow "now" tick, shared by the lobby cards
// and the in-game player bar (DESIGN §7.1). Games are days-per-move, so the
// display is coarse (days/hours) and the tick is per-minute — no per-second
// churn for a deadline measured in days.
import { useEffect, useState } from 'react';

/** "2d left" / "18h left" / "expiring" for a move deadline. The compact form
 * ("2d" / "18h" / "soon") pairs with a clock icon where bar space is tight. */
export function timeLeft(deadlineMs: number, nowMs: number, compact = false): string {
  const h = Math.max(0, Math.round((deadlineMs - nowMs) / 3_600_000));
  if (h < 1) return compact ? 'soon' : 'expiring';
  const label = h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
  return compact ? label : `${label} left`;
}

/** A clock that re-renders on an interval so relative labels stay fresh while
 * a screen is left open. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
