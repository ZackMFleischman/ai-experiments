// The client twin of @tafl/functions' TaflGameOptions — structurally
// identical; the emulator e2e exercises compatibility. tafl has a single
// ruleset (11×11 hnefatafl), so options carry only the async time control.
export interface TaflGameOptions {
  timeControl: { days: 1 | 3 | 7 } | null;
}

export type SeatChoice = 'attackers' | 'defenders' | 'random';

export const DEFAULT_OPTIONS: TaflGameOptions = { timeControl: null };

export function timeControlLabel(tc: TaflGameOptions['timeControl']): string {
  return tc ? `${tc.days} day${tc.days === 1 ? '' : 's'}/move` : 'No clock';
}

export function sideLabel(seat: 'attackers' | 'defenders'): string {
  return seat === 'attackers' ? 'Attackers' : 'Defenders';
}
