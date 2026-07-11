// The client twin of @checkers/functions' CheckersGameOptions — structurally
// identical; the emulator e2e exercises compatibility. checkers has a single
// ruleset (Brandub 7×7), so options carry only the async time control.
export interface CheckersGameOptions {
  timeControl: { days: 1 | 3 | 7 } | null;
}

export type SeatChoice = 'attackers' | 'defenders' | 'random';

export const DEFAULT_OPTIONS: CheckersGameOptions = { timeControl: null };

export function timeControlLabel(tc: CheckersGameOptions['timeControl']): string {
  return tc ? `${tc.days} day${tc.days === 1 ? '' : 's'}/move` : 'No clock';
}

export function sideLabel(seat: 'attackers' | 'defenders'): string {
  return seat === 'attackers' ? 'Attackers' : 'Defenders';
}
