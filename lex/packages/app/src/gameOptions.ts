// Per-game options (DESIGN §2.2) — the client twin of the backend's
// LexGameOptions (structurally identical; the e2e exercises compatibility).
// Firebase-free on purpose: screens and pickers import from here, only the
// sync layer touches the wire.
export interface LexGameOptions {
  rulesetId: string;
  dictionaryId: string;
  timeControl: { days: 1 | 3 | 7 } | null;
  /** Hard mode (DESIGN §2.3): the app withholds every dictionary verdict until
   * you commit, and a word the dictionary refuses costs the turn. */
  hardMode: boolean;
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

/** The house-rule label everywhere a game's options are restated (new-game
 * form, join card, in-game info) — one string so the three never drift. */
export const HARD_MODE_NAME = 'Hard mode';

/** What hard mode actually does, in one sentence, for the pickers. */
export const HARD_MODE_BLURB =
  'No spell-check: you find out whether a word counts only after you play it, and a word that isn’t in the dictionary costs your turn.';

export function houseRulesLabel(hardMode: boolean): string {
  return hardMode ? HARD_MODE_NAME : 'Standard rules';
}
