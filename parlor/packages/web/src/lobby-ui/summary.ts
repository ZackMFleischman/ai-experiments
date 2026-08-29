// ported from hive/packages/app/src/screens/lobbyView.tsx + turnBadge.ts (adapted)
// @parlor/web/lobby-ui — the game-agnostic lobby contract + pure helpers.
// A parlor game's lobby summary EXTENDS `LobbySummary` with its own card
// fields (scores, last play, a serialized board for the thumbnail); the shared
// components read only the base meta here and take the game-specific bits as
// injected render slots. Firebase-free, React-free — pure logic the game and
// the badge both build on.

/** Somebody else in the game — the N-seat generalization of `opponentName`. */
export interface Opponent {
  uid?: string;
  name: string;
  /** Seat index once seats exist; absent while a 3+ game is still a guest list. */
  seat?: number;
}

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
  /** Finished result, by seat: 'p0' won, 'p1' won, or a draw.
   * @deprecated The two-seat form. Read `finalStandings()` / `placingOf()`,
   * which fall back to this when a game predates `standings`. */
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

  // ── N seats (M7). Absent on a two-seat summary, which reads as it always did.
  /** How many seats this game holds. Undefined means two. */
  seatCount?: number;
  /** Places still to fill while a 3+ game is open. 0 once it has started. */
  openSeats?: number;
  /** Everyone else, in seat order once seats exist, else join order. */
  opponents?: readonly Opponent[];
  /** Final placings by seat, best-first; an inner array of 2+ seats is tied. */
  standings?: readonly (readonly number[])[];
  /** Seats that withdrew (resigned or timed out at 3+). */
  withdrawn?: readonly number[];
}

/**
 * Final placings, best-first. Prefers the N-seat `standings` and falls back to
 * the two-seat `result` so a game finished before M7 still reads correctly.
 * Empty while the game is unfinished.
 */
export function finalStandings(game: LobbySummary): readonly (readonly number[])[] {
  if (game.standings) return game.standings;
  if (!game.result) return [];
  if (game.result === 'draw') return [[0, 1]];
  return game.result === 'p0' ? [[0], [1]] : [[1], [0]];
}

/** 1-based placing of a seat, or null when the game has not finished. Tied
 *  seats share a placing. */
export function placingOf(game: LobbySummary, seat: number): number | null {
  const standings = finalStandings(game);
  const at = standings.findIndex((tied) => tied.includes(seat));
  return at === -1 ? null : at + 1;
}

/** Did `seat` win outright or share the top placing? */
export function isWinner(game: LobbySummary, seat: number): boolean {
  return placingOf(game, seat) === 1;
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
      (g.status === 'active' && g.toMove === g.mySeat && !g.withdrawn?.includes(g.mySeat)) ||
      (g.status === 'open' && g.challenge?.direction === 'incoming') ||
      g.freshFromOpponent === true,
  ).length;
}

/** A past opponent, challengeable without a code. */
export interface Friend {
  uid: string;
  name: string;
}

/** Distinct past opponents, most recent first — the direct-challenge targets.
 *  Prefers `opponents` (every other player) and falls back to the two-seat
 *  pair, so a three-handed game contributes all of its players, not one. */
export function friendsFrom(
  games: ReadonlyArray<
    Pick<LobbySummary, 'opponentUid' | 'opponentName' | 'updatedAtMs' | 'opponents'>
  >,
): Friend[] {
  const seen = new Map<string, Friend>();
  for (const g of [...games].sort((a, b) => b.updatedAtMs - a.updatedAtMs)) {
    const others: Friend[] = g.opponents
      ? g.opponents.flatMap((o) => (o.uid ? [{ uid: o.uid, name: o.name }] : []))
      : g.opponentUid && g.opponentName
        ? [{ uid: g.opponentUid, name: g.opponentName }]
        : [];
    for (const friend of others) if (!seen.has(friend.uid)) seen.set(friend.uid, friend);
  }
  return [...seen.values()];
}
