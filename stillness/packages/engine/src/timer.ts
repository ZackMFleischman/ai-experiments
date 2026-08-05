// The sit timer as a pure machine: state is three timestamps and a duration,
// remaining time is arithmetic over an injected `now` — no interval owns the
// truth, so a throttled background tab, a paused WebView, or a test clock all
// compute the same answer. (The solo kit's "clock is passed in, never read"
// discipline.)

export interface SitTimer {
  durationMs: number;
  /** Epoch ms when the sit started. */
  startedAt: number;
  /** Epoch ms of the current pause; null while running. */
  pausedAt: number | null;
  /** Total ms spent paused before the current pause. */
  pausedTotalMs: number;
}

export function startSit(durationMs: number, now: number): SitTimer {
  return { durationMs, startedAt: now, pausedAt: null, pausedTotalMs: 0 };
}

export function elapsedMs(timer: SitTimer, now: number): number {
  const end = timer.pausedAt ?? now;
  return Math.max(0, end - timer.startedAt - timer.pausedTotalMs);
}

export function remainingMs(timer: SitTimer, now: number): number {
  return Math.max(0, timer.durationMs - elapsedMs(timer, now));
}

export function isDone(timer: SitTimer, now: number): boolean {
  return remainingMs(timer, now) === 0;
}

export function pauseSit(timer: SitTimer, now: number): SitTimer {
  if (timer.pausedAt !== null) return timer;
  return { ...timer, pausedAt: now };
}

export function resumeSit(timer: SitTimer, now: number): SitTimer {
  if (timer.pausedAt === null) return timer;
  return {
    ...timer,
    pausedAt: null,
    pausedTotalMs: timer.pausedTotalMs + (now - timer.pausedAt),
  };
}

/** mm:ss for the big display (ceil, so a fresh 10:00 shows 10:00, not 9:59). */
export function formatRemaining(timer: SitTimer, now: number): string {
  const totalSeconds = Math.ceil(remainingMs(timer, now) / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
