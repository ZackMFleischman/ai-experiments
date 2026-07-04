// T3.4 (lex): the generic log-sync + optimistic-submit/rollback core ported
// from hive's GameController. Exercised over a tiny counter "game" — parlor
// never knows a real one.
import { describe, expect, it, vi } from 'vitest';
import { LogSession } from '../src/logSession.js';
import type { GameTransport, StoredGame } from '../src/transport.js';

interface Opts {
  start: number;
}
type Entry = { kind: 'add'; n: number } | { kind: 'end' };
interface State {
  total: number;
  ended: boolean;
}

const CONFIG = {
  init: (options: Opts): State => ({ total: options.start, ended: false }),
  apply: (state: State, entry: Entry): State =>
    entry.kind === 'add'
      ? { ...state, total: state.total + entry.n }
      : { ...state, ended: true },
};

class ScriptedTransport implements GameTransport<Opts, Entry> {
  game: StoredGame<Opts, Entry> = { options: { start: 0 }, log: [] };
  remote: ((entry: Entry, index: number) => void) | null = null;
  submitError: Error | null = null;
  loads = 0;

  async load(): Promise<StoredGame<Opts, Entry> | null> {
    this.loads++;
    return { options: this.game.options, log: [...this.game.log] };
  }
  async submit(entry: Entry, expectedIndex: number): Promise<void> {
    if (this.submitError) throw this.submitError;
    if (this.game.log.length !== expectedIndex) throw new Error('concurrency');
    this.game.log.push(entry);
  }
  onRemoteEntry(cb: (entry: Entry, index: number) => void): () => void {
    this.remote = cb;
    return () => {
      this.remote = null;
    };
  }
  async reset(options: Opts): Promise<void> {
    this.game = { options, log: [] };
  }
  pushRemote(entry: Entry): void {
    this.game.log.push(entry);
    this.remote?.(entry, this.game.log.length - 1);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeSession(t: ScriptedTransport, onRejected = vi.fn()) {
  return {
    session: new LogSession<Opts, Entry, State>(t, CONFIG, { onRejected }),
    onRejected,
  };
}

describe('LogSession', () => {
  it('init folds the stored log into state', async () => {
    const t = new ScriptedTransport();
    t.game = { options: { start: 10 }, log: [{ kind: 'add', n: 5 }, { kind: 'add', n: 2 }] };
    const { session } = makeSession(t);
    await session.init();
    expect(session.state?.total).toBe(17);
    expect(session.log).toHaveLength(2);
    expect(session.options).toEqual({ start: 10 });
  });

  it('submit applies optimistically and lands in the transport at the right index', async () => {
    const t = new ScriptedTransport();
    const { session } = makeSession(t);
    await session.init();
    session.submit({ kind: 'add', n: 3 });
    expect(session.state?.total).toBe(3); // applied before the transport settles
    await tick();
    expect(t.game.log).toEqual([{ kind: 'add', n: 3 }]);
    session.submit({ kind: 'add', n: 4 });
    await tick();
    expect(t.game.log).toHaveLength(2);
  });

  it('a rejected submit rolls back state + log and reports', async () => {
    const t = new ScriptedTransport();
    const { session, onRejected } = makeSession(t);
    await session.init();
    session.submit({ kind: 'add', n: 3 });
    await tick();
    t.submitError = new Error('nope');
    session.submit({ kind: 'add', n: 100 });
    expect(session.state?.total).toBe(103);
    await tick();
    expect(session.state?.total).toBe(3);
    expect(session.log).toHaveLength(1);
    expect(onRejected).toHaveBeenCalledOnce();
  });

  it("mode 'resync' reloads from the transport instead of rolling back", async () => {
    const t = new ScriptedTransport();
    const { session } = makeSession(t);
    await session.init();
    t.submitError = new Error('nope');
    session.submit({ kind: 'end' }, 'resync');
    await tick();
    await tick();
    expect(session.state?.ended).toBe(false); // truth restored from load()
    expect(t.loads).toBeGreaterThan(1);
  });

  it('remote entries apply; echoes are ignored; a gap resyncs', async () => {
    const t = new ScriptedTransport();
    const { session } = makeSession(t);
    await session.init();
    t.pushRemote({ kind: 'add', n: 7 });
    expect(session.state?.total).toBe(7);
    // Echo of an already-applied entry: same index again.
    t.remote?.({ kind: 'add', n: 7 }, 0);
    expect(session.state?.total).toBe(7);
    // Gap: index 5 with only 1 applied → reload from source of truth.
    t.game.log = [{ kind: 'add', n: 7 }, { kind: 'add', n: 1 }, { kind: 'add', n: 1 }];
    t.remote?.({ kind: 'add', n: 1 }, 5);
    await tick();
    expect(session.state?.total).toBe(9);
  });

  it('subscribers are notified on every change', async () => {
    const t = new ScriptedTransport();
    const { session } = makeSession(t);
    const cb = vi.fn();
    session.subscribe(cb);
    await session.init();
    session.submit({ kind: 'add', n: 1 });
    expect(cb).toHaveBeenCalled();
  });

  it('reset starts a fresh game through the transport', async () => {
    const t = new ScriptedTransport();
    const { session } = makeSession(t);
    await session.init();
    session.submit({ kind: 'add', n: 3 });
    await tick();
    await session.reset({ start: 100 });
    expect(session.state?.total).toBe(100);
    expect(session.log).toHaveLength(0);
    expect(t.game.options).toEqual({ start: 100 });
  });

  it('load() returning null leaves the session empty (no game yet)', async () => {
    const t = new ScriptedTransport();
    t.load = async () => null;
    const { session } = makeSession(t);
    await session.init();
    expect(session.state).toBeNull();
  });
});
