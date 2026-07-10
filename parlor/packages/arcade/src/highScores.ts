// Local, account-free high scores — the arcade sibling of @parlor/solo's
// StatsStore: results live only in the player's injected storage,
// aggregated on read. Buckets are opaque strings (difficulty, mode, …) so
// this stays game-agnostic. Storage failures never interrupt play.

/** Structural twin of @parlor/solo's KeyValueStorage — parlor packages stay
 * standalone; structural typing keeps them interchangeable. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ScoreRecord {
  score: number;
  /** Local day key ('2026-07-10') — @parlor/solo's dayKey() shape. */
  day: string;
  /** Opaque grouping key, e.g. a difficulty tier. */
  bucket?: string;
}

const MAX_SCORES = 500;

export class HighScoreStore {
  constructor(
    private readonly storageKey: string,
    private readonly storage: KeyValueStorage,
  ) {}

  /** Append a result; returns true when it sets a new best for its bucket. */
  record(record: ScoreRecord): boolean {
    const previous = this.best(record.bucket);
    const all = [...this.scores(), record].slice(-MAX_SCORES);
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(all));
    } catch {
      // Quota/permissions: play continues, the score just won't persist.
    }
    return previous === null || record.score > previous.score;
  }

  scores(): readonly ScoreRecord[] {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r): r is ScoreRecord =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as ScoreRecord).score === 'number' &&
          typeof (r as ScoreRecord).day === 'string',
      );
    } catch {
      return [];
    }
  }

  best(bucket?: string): ScoreRecord | null {
    const top = this.top(1, bucket);
    return top[0] ?? null;
  }

  /** Highest first; earlier record wins ties (the first to set it keeps it). */
  top(count: number, bucket?: string): readonly ScoreRecord[] {
    return this.scores()
      .filter((r) => bucket === undefined || r.bucket === bucket)
      .map((record, index) => ({ record, index }))
      .sort(
        (a, b) => b.record.score - a.record.score || a.index - b.index,
      )
      .slice(0, count)
      .map((entry) => entry.record);
  }
}
