// ported from hive/packages/app/src/screens/lobbyView.tsx + turnBadge.ts (adapted)
// @parlor/web/lobby-ui — the game-agnostic lobby contract + pure helpers.
// A parlor game's lobby summary EXTENDS `LobbySummary` with its own card
// fields (scores, last play, a serialized board for the thumbnail); the shared
// components read only the base meta here and take the game-specific bits as
// injected render slots. Firebase-free, React-free — pure logic the game and
// the badge both build on.

/** The cross-game lobby-card contract: platform meta every parlor game shares.
 * Seats are indices (0 = the player who moves first); a game that names its
 * seats otherwise (hive's white/black) maps to indices in its `toSummary`. */
export interface LobbySummary {
  id: string;
  /** Which seat I hold in this game (0 | 1 in a two-player game). */
  mySeat: number;
  opponentName: string | null;
  status: 'open' | 'active' | 'finished';
  /** Seat to move (index). */
  toMove: number;
  /** Finished result, by seat: 'p0' won, 'p1' won, or a draw. */
  result?: 'p0' | 'p1' | 'draw';
  endedBy?: string;
  updatedAtMs: number;
  /** Async clock: the current move deadline, when the game has a time control. */
  deadlineAtMs?: number;
  /** The other player's uid where known — feeds the new-game friend picker. */
  opponentUid?: string;
  /** Direct challenge while open: who challenged whom. */
  challenge?: { direction: 'incoming' | 'outgoing'; name: string };
  /** Active at move zero, activated by the opponent (accepted invite/challenge,
   * rematch offer) — counts toward the badge even before it's my move. */
  freshFromOpponent?: boolean;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" — coarse relative time. */
export function relativeTime(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "2d left" / "18h left" / "expiring" for a move deadline. The compact form
 * ("2d" / "18h" / "soon") pairs with a clock icon where bar space is tight.
 * Parlor games are days-per-move, so the display is coarse (days/hours). */
export function timeLeft(deadlineMs: number, nowMs: number, compact = false): string {
  const h = Math.max(0, Math.round((deadlineMs - nowMs) / 3_600_000));
  if (h < 1) return compact ? 'soon' : 'expiring';
  const label = h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
  return compact ? label : `${label} left`;
}

/** What the turn badge counts: games on my move, incoming challenges, and
 * fresh opponent-activated games. Must stay in step with the server's
 * countActionable (@parlor/server notify) — the push carries the same number
 * for the closed-app icon badge. */
export function actionableCount(games: readonly LobbySummary[]): number {
  return games.filter(
    (g) =>
      (g.status === 'active' && g.toMove === g.mySeat) ||
      (g.status === 'open' && g.challenge?.direction === 'incoming') ||
      g.freshFromOpponent === true,
  ).length;
}

/** A past opponent, challengeable without a code. */
export interface Friend {
  uid: string;
  name: string;
}

/** Distinct past opponents, most recent first — the direct-challenge targets. */
export function friendsFrom(
  games: ReadonlyArray<{ opponentUid?: string; opponentName: string | null; updatedAtMs: number }>,
): Friend[] {
  const seen = new Map<string, Friend>();
  for (const g of [...games].sort((a, b) => b.updatedAtMs - a.updatedAtMs)) {
    if (!g.opponentUid || !g.opponentName || seen.has(g.opponentUid)) continue;
    seen.set(g.opponentUid, { uid: g.opponentUid, name: g.opponentName });
  }
  return [...seen.values()];
}
