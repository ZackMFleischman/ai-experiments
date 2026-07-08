// Robust submission: an optimistic move is persisted with retry/backoff. A
// dropped connection is retried (and can be retried manually) rather than
// silently dropping the move; only a definite rejection rolls it back. This is
// the safety net behind the reported "the winning move never reached the
// backend" bug.
import type { GameOptions } from '@hive/engine';
import { describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import type { GameTransport, LogEntry, StoredGame } from '../src/controller/transport';
import { ALL_ON } from './replay';

/** Reject the next queued error (FIFO) before accepting; models a flaky link. */
class FlakyTransport implements GameTransport {
  log: LogEntry[] = [];
  errors: unknown[] = [];

  constructor(private readonly options: GameOptions) {}

  async load(): Promise<StoredGame | null> {
    return { options: this.options, log: [...this.log] };
  }
  async submit(entry: LogEntry, expectedIndex: number): Promise<void> {
    if (this.errors.length) throw this.errors.shift();
    if (this.log.length !== expectedIndex) throw new Error('concurrency');
    this.log.push(entry);
  }
  onRemoteEntry(): () => void {
    return () => {};
  }
  async reset(): Promise<void> {
    this.log = [];
  }
}

/** A firebase-callable-shaped error carrying a `functions/<code>` code. */
const fbError = (code: string) => Object.assign(new Error(code), { code: `functions/${code}` });

/** Flush the setTimeout(0) retry chain. */
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Make white's opening placement (immediate-commit; confirm-move off). */
function playOpening(c: GameController): void {
  c.selectHandBug('S');
  c.selectCell({ q: 0, r: 0 });
}

function makeController(t: GameTransport): GameController {
  return new GameController(t, ALL_ON, undefined, { delays: [0, 0, 0] });
}

describe('robust submission', () => {
  it('retries a transient failure and keeps the move applied', async () => {
    const t = new FlakyTransport(ALL_ON);
    t.errors = [fbError('unavailable'), fbError('deadline-exceeded')];
    const c = makeController(t);
    await c.init();

    playOpening(c);
    expect(c.getSnapshot().state.board.size).toBe(1); // optimistic, on-screen
    expect(c.getSnapshot().syncStatus).toBe('saving');

    await settle();
    const s = c.getSnapshot();
    expect(t.log).toHaveLength(1); // reached the backend
    expect(s.state.board.size).toBe(1); // never rolled back
    expect(s.syncStatus).toBeUndefined(); // saved
  });

  it('surfaces an error (not a silent drop) once retries are exhausted', async () => {
    const t = new FlakyTransport(ALL_ON);
    t.errors = [fbError('unavailable'), fbError('unavailable'), fbError('unavailable'), fbError('unavailable')];
    const c = makeController(t); // 3 retries, so 4 failures exhaust them
    await c.init();

    playOpening(c);
    await settle();
    const s = c.getSnapshot();
    expect(s.syncStatus).toBe('error');
    expect(s.state.board.size).toBe(1); // move NOT dropped — still shown
    expect(t.log).toHaveLength(0); // not yet persisted
    expect(s.notice?.text).toMatch(/retry/i);
  });

  it('retryPending() re-sends a stuck move once the link is back', async () => {
    const t = new FlakyTransport(ALL_ON);
    t.errors = [fbError('unavailable'), fbError('unavailable'), fbError('unavailable'), fbError('unavailable')];
    const c = makeController(t);
    await c.init();
    playOpening(c);
    await settle();
    expect(c.getSnapshot().syncStatus).toBe('error');

    c.retryPending(); // connection restored, no queued errors left
    await settle();
    const s = c.getSnapshot();
    expect(s.syncStatus).toBeUndefined();
    expect(t.log).toHaveLength(1);
    expect(s.state.board.size).toBe(1);
  });

  it('rolls back a definite (non-transient) rejection', async () => {
    const t = new FlakyTransport(ALL_ON);
    t.errors = [fbError('failed-precondition')]; // e.g. stale move count
    const c = makeController(t);
    await c.init();

    playOpening(c);
    await settle();
    const s = c.getSnapshot();
    expect(s.state.board.size).toBe(0); // undone
    expect(s.log).toHaveLength(0);
    expect(s.syncStatus).toBeUndefined();
    expect(s.notice?.text).toMatch(/rejected/i);
  });

  it('keeps a move whose write landed but whose ack was lost (no false rollback)', async () => {
    // The write commits server-side, but the response is lost; the retry then
    // sees a stale move count (a "definite" rejection). Reconciling against the
    // server must KEEP the move — not undo one that actually succeeded.
    class LostAckTransport implements GameTransport {
      log: LogEntry[] = [];
      private calls = 0;
      async load(): Promise<StoredGame> {
        return { options: ALL_ON, log: [...this.log] };
      }
      async submit(entry: LogEntry): Promise<void> {
        this.calls++;
        if (this.calls === 1) {
          this.log.push(entry); // landed...
          throw fbError('unavailable'); // ...but the ack never came back
        }
        throw fbError('failed-precondition'); // retry: server already advanced
      }
      onRemoteEntry(): () => void {
        return () => {};
      }
      async reset(): Promise<void> {
        this.log = [];
      }
    }
    const t = new LostAckTransport();
    const c = makeController(t);
    await c.init();

    playOpening(c);
    await settle();
    const s = c.getSnapshot();
    expect(t.log).toHaveLength(1); // it really did land
    expect(s.state.board.size).toBe(1); // and it is kept
    expect(s.syncStatus).toBeUndefined();
    expect(s.notice?.text ?? '').not.toMatch(/rejected|undone/i); // not a false rejection
  });

  it('resync() flushes a stuck move instead of discarding it', async () => {
    const t = new FlakyTransport(ALL_ON);
    t.errors = [fbError('unavailable'), fbError('unavailable'), fbError('unavailable'), fbError('unavailable')];
    const c = makeController(t);
    await c.init();
    playOpening(c);
    await settle();
    expect(c.getSnapshot().syncStatus).toBe('error');
    expect(c.getSnapshot().state.board.size).toBe(1); // still on-screen

    // A visibility/push-driven resync (dead-stream safety net) must SEND the
    // pending move, never rebuild-from-source over the top of it.
    await c.resync();
    await settle();
    const s = c.getSnapshot();
    expect(s.syncStatus).toBeUndefined();
    expect(t.log).toHaveLength(1); // delivered, not dropped
    expect(s.state.board.size).toBe(1);
  });

  it('retryPending() is a no-op when nothing is stuck', async () => {
    const t = new FlakyTransport(ALL_ON);
    const c = makeController(t);
    await c.init();
    c.retryPending();
    expect(c.getSnapshot().syncStatus).toBeUndefined();
    playOpening(c);
    await settle();
    c.retryPending(); // already saved
    expect(c.getSnapshot().syncStatus).toBeUndefined();
    expect(t.log).toHaveLength(1);
  });
});
