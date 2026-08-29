// Per-game options (DESIGN §2.2) — the client twin of the backend's
// LexGameOptions (structurally identical; the e2e exercises compatibility).
// Firebase-free on purpose: screens and pickers import from here, only the
// sync layer touches the wire.
import type { InvalidWordRule } from '@lex/engine';

export type { InvalidWordRule };

export interface LexGameOptions {
  rulesetId: string;
  dictionaryId: string;
  timeControl: { days: 1 | 3 | 7 } | null;
  /** What happens to a play whose words aren't all in the dictionary
   * (DESIGN §2.3) — picked at creation like the board and the word list. */
  invalidWords: InvalidWordRule;
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

// ── invalid words (DESIGN §2.3) ──────────────────────────────────────────────
// One copy source for the setting, so the new-game picker, the join card and
// the in-game info dialog can never describe the same game differently.

/** The setting's name, as the pickers title it. */
export const INVALID_WORDS_NAME = 'Invalid words';

/** The choice, in the fewest words that still say what happens on your turn. */
export const INVALID_WORDS_LABELS: Readonly<Record<InvalidWordRule, string>> = {
  blocked: 'Can’t be played',
  'costs-turn': 'Cost your turn',
};

/** The rule in a sentence — shown under the picker and in the game info, so
 * nobody picks (or accepts) it without knowing what it does to a turn. */
export const INVALID_WORDS_BLURBS: Readonly<Record<InvalidWordRule, string>> = {
  blocked:
    'Every word is checked as you place it: a word that isn’t in the dictionary is flagged and can’t be played.',
  'costs-turn':
    'No checking as you place: you find out whether a word counts only after you play it, and one that isn’t in the dictionary costs your turn.',
};

export function invalidWordsLabel(rule: InvalidWordRule): string {
  return INVALID_WORDS_LABELS[rule] ?? rule;
}

/** `the invalid word “X”` / `the invalid words “X” and “Y”`. The words a
 * refused play formed are public (DESIGN §3.3) — this is the one phrasing for
 * them, so the banner and the score sheet name them identically. The server
 * builds the same sentence for the push from its own package (it cannot import
 * this one); both sides pin the exact string in their tests, so a change to one
 * that is not mirrored in the other shows up as a diff. */
export function invalidWordList(words: readonly string[]): string {
  const quoted = words.map((w) => `“${w}”`);
  const list =
    quoted.length <= 1
      ? (quoted[0] ?? '')
      : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
  return `the invalid word${words.length === 1 ? '' : 's'} ${list}`;
}
