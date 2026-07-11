// The client twin of @checkers/functions' CheckersGameOptions — structurally
// identical; the emulator e2e exercises compatibility. checkers has a single
// ruleset (American checkers, 8×8), so options carry only the async time
// control.
export interface CheckersGameOptions {
  timeControl: { days: 1 | 3 | 7 } | null;
}

export type SeatChoice = 'dark' | 'light' | 'random';

export const DEFAULT_OPTIONS: CheckersGameOptions = { timeControl: null };

export function timeControlLabel(tc: CheckersGameOptions['timeControl']): string {
  return tc ? `${tc.days} day${tc.days === 1 ? '' : 's'}/move` : 'No clock';
}

export function sideLabel(seat: 'dark' | 'light'): string {
  return seat === 'dark' ? 'Dark' : 'Light';
}
