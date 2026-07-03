// T4.6: controller remote-entry wiring + player perspective. A scriptable
// transport stands in for Firestore: entries can arrive from the opponent,
// out of order (gap ⇒ resync via load), or as echoes of our own submits.
import type { GameOptions } from '@hive/engine';
import { describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import type { GameTransport, LogEntry, StoredGame } from '../src/controller/transport';

const OPTIONS: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

class ScriptedTransport implements GameTransport {
  game: StoredGame = { options: OPTIONS, log: [] };
  remote: ((entry: LogEntry, index: number) => void) | null = null;
  submitError: Error | null = null;
  loads = 0;

  async load(): Promise<StoredGame | null> {
    this.loads++;
    return { options: this.game.options, log: [...this.game.log] };
  }
  async submit(entry: LogEntry, expectedIndex: number): Promise<void> {
    if (this.submitError) throw this.submitError;
    if (this.game.log.length !== expectedIndex) throw new Error('concurrency');
    this.game.log.push(entry);
  }
  onRemoteEntry(cb: (entry: LogEntry, index: number) => void): () => void {
    this.remote = cb;
    return () => {
      this.remote = null;
    };
  }
  async reset(): Promise<void> {
    throw new Error('unsupported');
  }

  /** Opponent move lands server-side and is pushed to the listener. */
  pushRemote(entry: LogEntry): void {
    this.game.log.push(entry);
    this.remote?.(entry, this.game.log.length - 1);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('remote entries', () => {
  it('applies an opponent move arriving through the listener', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS, 'b');
    await c.init();
    t.pushRemote({ kind: 'move', uhp: 'wS1' });
    const snap = c.getSnapshot();
    expect(snap.state.board.size).toBe(1);
    expect(snap.toMove).toBe('b');
    expect(snap.log).toHaveLength(1);
  });

  it('ignores echoes of already-applied local moves', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS, 'w');
    await c.init();
    c.selectHandBug('S');
    c.selectCell({ q: 0, r: 0 });
    await tick();
    expect(c.getSnapshot().log).toHaveLength(1);
    // server echoes our own entry back at the same index
    t.remote?.({ kind: 'move', uhp: 'wS1' }, 0);
    expect(c.getSnapshot().log).toHaveLength(1);
    expect(c.getSnapshot().state.board.size).toBe(1);
  });

  it('resyncs from load() when a gap appears', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS, 'w');
    await c.init();
    const loadsBefore = t.loads;
    // two entries land server-side but only the second reaches the listener
    t.game.log.push({ kind: 'move', uhp: 'wS1' });
    t.game.log.push({ kind: 'move', uhp: 'bS1 wS1-' });
    t.remote?.({ kind: 'move', uhp: 'bS1 wS1-' }, 1);
    await tick();
    expect(t.loads).toBeGreaterThan(loadsBefore);
    expect(c.getSnapshot().log).toHaveLength(2);
    expect(c.getSnapshot().state.board.size).toBe(2);
  });

  it('applies remote meta entries (draw offer → accept ends the game)', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS, 'w');
    await c.init();
    t.pushRemote({ kind: 'draw-offer', by: 'b' });
    expect(c.getSnapshot().pendingDrawOffer).toBe('b');
    c.respondDraw('w', true);
    await tick();
    expect(c.getSnapshot().end).toEqual({ by: 'draw-agreed' });
  });

  it('rolls back an optimistic move the server rejects', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS, 'w');
    await c.init();
    t.submitError = new Error('stale');
    c.selectHandBug('S');
    c.selectCell({ q: 0, r: 0 });
    await tick();
    expect(c.getSnapshot().state.board.size).toBe(0);
    expect(c.getSnapshot().log).toHaveLength(0);
  });
});

describe('perspective', () => {
  it('exposes myColor and blocks interaction off-turn', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS, 'b'); // white to move
    await c.init();
    const snap = c.getSnapshot();
    expect(snap.myColor).toBe('b');
    expect(snap.placeableBugs.size).toBe(0); // not my turn: no affordances
    c.selectHandBug('S');
    expect(c.getSnapshot().selection).toBeUndefined();
  });

  it('allows interaction on my turn', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS, 'w');
    await c.init();
    expect(c.getSnapshot().placeableBugs.size).toBeGreaterThan(0);
    c.selectHandBug('S');
    expect(c.getSnapshot().selection).toBeTruthy();
  });

  it('hot-seat (no perspective) behaves as before', async () => {
    const t = new ScriptedTransport();
    const c = new GameController(t, OPTIONS);
    await c.init();
    expect(c.getSnapshot().myColor).toBeUndefined();
    expect(c.getSnapshot().placeableBugs.size).toBeGreaterThan(0);
  });
});
