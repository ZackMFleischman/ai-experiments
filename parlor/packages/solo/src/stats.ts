// Local, account-free play stats for solo games: results live only in the
// player's injected storage, aggregated on read. Buckets are opaque strings
// (a game's difficulty tiers, modes, …) so this stays game-agnostic.

import type { KeyValueStorage } from './soloSession.js';

export interface ResultRecord {
  /** Local day key ('2026-07-10') — see seed.ts dayKey(). */
  day: string;
  durationMs: number;
  won: boolean;
  /** Opaque grouping key, e.g. a difficulty tier. */
  bucket?: string;
}

export interface StatsSummary {
  played: number;
  won: number;
  /** Fastest winning time; null until the first win. */
  bestDurationMs: number | null;
  currentStreak: number;
  bestStreak: number;
}

export interface Streaks {
  current: number;
  best: number;
}

/** Streaks over local day keys: best = longest run of consecutive days;
 * current = the run ending at `today` — still alive if the latest win was
 * yesterday (a streak isn't broken until a full day is missed). Pure;
 * `today` is passed in, never read from the clock. */
export function computeStreaks(days: readonly string[], today: string): Streaks {
  const unique = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of unique) {
    run = previous !== null && isNextDay(previous, day) ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }
  const last = unique[unique.length - 1];
  const current =
    last !== undefined && (last === today || isNextDay(last, today)) ? run : 0;
  return { current, best };
}

function isNextDay(before: string, after: string): boolean {
  const b = Date.parse(`${before}T00:00:00Z`);
  const a = Date.parse(`${after}T00:00:00Z`);
  return a - b === 86_400_000;
}

const MAX_RESULTS = 2000;

export class StatsStore {
  constructor(
    private readonly storageKey: string,
    private readonly storage: KeyValueStorage,
  ) {}

  record(result: ResultRecord): void {
    const all = [...this.results(), result].slice(-MAX_RESULTS);
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(all));
    } catch {
      // Storage failures never interrupt play.
    }
  }

  results(): readonly ResultRecord[] {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r): r is ResultRecord =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as ResultRecord).day === 'string' &&
          typeof (r as ResultRecord).durationMs === 'number' &&
          typeof (r as ResultRecord).won === 'boolean',
      );
    } catch {
      return [];
    }
  }

  /** Aggregate, optionally per bucket. Streaks count winning days. */
  summary(today: string, bucket?: string): StatsSummary {
    const results = this.results().filter(
      (r) => bucket === undefined || r.bucket === bucket,
    );
    const wins = results.filter((r) => r.won);
    const streaks = computeStreaks(
      wins.map((r) => r.day),
      today,
    );
    return {
      played: results.length,
      won: wins.length,
      bestDurationMs: wins.length
        ? Math.min(...wins.map((r) => r.durationMs))
        : null,
      currentStreak: streaks.current,
      bestStreak: streaks.best,
    };
  }
}
