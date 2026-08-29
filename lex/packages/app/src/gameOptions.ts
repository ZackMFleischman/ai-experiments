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
