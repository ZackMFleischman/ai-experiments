// Per-game options (DESIGN §2.2) — the client twin of the backend's
// LexGameOptions (structurally identical; the e2e exercises compatibility).
// Firebase-free on purpose: screens and pickers import from here, only the
// sync layer touches the wire.
export interface LexGameOptions {
  rulesetId: string;
  dictionaryId: string;
  timeControl: { days: 1 | 3 | 7 } | null;
  /** The host's chosen MAXIMUM seat count (DECISIONS 2026-08-28 — the count is
   * a maximum, not a fixed size). Absent means two. The picker is T7.15; the
   * field exists now so the sync layer can branch on it. */
  maxPlayers?: number;
}

/** Turn-order choice (DESIGN §2.3): p0 moves first; 'me' seats the creator
 * as p0, 'them' as p1. */
export type SeatChoice = 'me' | 'them' | 'random';

export type TimeControlDays = 1 | 3 | 7 | null;

/** Display names for the v1 board layouts (ids are engine data, not copy). */
export const BOARD_NAMES: Readonly<Record<string, string>> = {
  classic: 'Classic',
  modern: 'Modern',
};

export function boardName(rulesetId: string): string {
  return BOARD_NAMES[rulesetId] ?? rulesetId;
}

export function timeControlLabel(timeControl: { days: number } | null): string {
  return timeControl ? `${timeControl.days} day${timeControl.days === 1 ? '' : 's'} per move` : 'No clock';
}

/** The seat range a ruleset allows (`Ruleset.players`). Nothing in the UI may
 * assume 2–4: the range is engine data, and a board that can only deal three
 * racks says so here. */
export interface SeatRange {
  min: number;
  max: number;
}

/** Every seat count the range allows, low to high — the count picker's options. */
export function seatCounts(range: SeatRange): number[] {
  const counts: number[] = [];
  for (let n = range.min; n <= range.max; n++) counts.push(n);
  return counts;
}

/** Pull a chosen count back inside a range (a board change can narrow it). */
export function clampCount(count: number, range: SeatRange): number {
  return Math.min(Math.max(count, range.min), range.max);
}

/** Whether a board can seat this many players. */
export function seats(range: SeatRange, count: number): boolean {
  return count >= range.min && count <= range.max;
}

/**
 * The pace line under the time control: a round is one move per player, so the
 * wait between YOUR turns grows with the table. Null when there is no clock —
 * an untimed game has no pace to state.
 */
export function paceLine(timeControl: { days: number } | null, players: number): string | null {
  if (!timeControl) return null;
  const round = timeControl.days * players;
  return `${timeControlLabel(timeControl)} — about ${round} day${round === 1 ? '' : 's'} a round at ${players} players`;
}
