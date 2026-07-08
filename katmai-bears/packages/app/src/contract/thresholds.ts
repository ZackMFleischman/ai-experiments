// Tunable thresholds. `alert` is the "more than N bears" line; `bearapalooza` is
// the sacred 12-bear line. Both live here so the reducer, UI, and a future backend
// agree on the numbers.

export interface Thresholds {
  /** Fire an alert when a single feed shows STRICTLY MORE than this many bears. */
  alert: number;
  /** At or above this many bears on one feed, it's officially a Bearapalooza. */
  bearapalooza: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  alert: 5,
  bearapalooza: 12,
};
