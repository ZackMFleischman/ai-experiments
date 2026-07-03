// T3.11: hot-seat persistence — save/resume/clear round-trip through the
// GameTransport seam.
import { describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import { LocalStorageTransport } from '../src/controller/localStorageTransport';
import { ALL_ON } from './replay';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

async function play(c: GameController, plies: Array<['hand', string] | ['cell', number, number]>) {
  for (const p of plies) {
    if (p[0] === 'hand') c.selectHandBug(p[1] as never);
    else c.selectCell({ q: p[1], r: p[2] });
  }
  await Promise.resolve(); // let submits settle
}

describe('hot-seat persistence (T3.11)', () => {
  it('a refreshed controller resumes the stored game (moves + meta)', async () => {
    const storage = memoryStorage();
    const first = new GameController(new LocalStorageTransport(ALL_ON, storage), ALL_ON);
    await first.init();
    await play(first, [
      ['hand', 'S'], ['cell', 0, 0],
      ['hand', 'S'], ['cell', 1, 0],
      ['hand', 'Q'], ['cell', -1, 0],
    ]);
    first.offerDraw('b');

    // "Refresh": a brand-new transport + controller over the same storage.
    const second = new GameController(new LocalStorageTransport(ALL_ON, storage), ALL_ON);
    await second.init();
    const snap = second.getSnapshot();
    expect(snap.state.board.size).toBe(3);
    expect(snap.toMove).toBe('b');
    expect(snap.log).toHaveLength(4);
    expect(snap.pendingDrawOffer).toBe('b');
    expect(snap.lastMove?.to).toEqual({ q: -1, r: 0 });
  });

  it('a finished game also resumes (result overlay state re-derived)', async () => {
    const storage = memoryStorage();
    const first = new GameController(new LocalStorageTransport(ALL_ON, storage), ALL_ON);
    await first.init();
    await play(first, [['hand', 'S'], ['cell', 0, 0]]);
    first.resign('w');
    await Promise.resolve();

    const second = new GameController(new LocalStorageTransport(ALL_ON, storage), ALL_ON);
    await second.init();
    expect(second.getSnapshot().end).toEqual({ by: 'resign', winner: 'b' });
  });

  it('"New game" clears the stored game', async () => {
    const storage = memoryStorage();
    const first = new GameController(new LocalStorageTransport(ALL_ON, storage), ALL_ON);
    await first.init();
    await play(first, [['hand', 'S'], ['cell', 0, 0]]);
    await first.newGame();

    const second = new GameController(new LocalStorageTransport(ALL_ON, storage), ALL_ON);
    await second.init();
    expect(second.getSnapshot().state.board.size).toBe(0);
    expect(second.getSnapshot().log).toEqual([]);
  });

  it('corrupt storage is ignored, not fatal', async () => {
    const storage = memoryStorage();
    storage.setItem('hive.hotseat.v1', '{not json');
    const c = new GameController(new LocalStorageTransport(ALL_ON, storage), ALL_ON);
    await c.init();
    expect(c.getSnapshot().state.board.size).toBe(0);
  });
});
