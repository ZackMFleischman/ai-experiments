// T3.8 gate: hot-seat — bag shuffled at the edge, full game in (injected)
// localStorage behind the transport seam, refresh resumes, and the
// pass-device interstitial hides racks between turns (DESIGN §7.3).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RULESETS } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalStorageTransport, type KeyValueStorage } from '@parlor/core';
import { describe, expect, it } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { HotSeatGame } from '../src/game/HotSeatGame';
import { HOTSEAT_STORAGE_KEY, createHotSeatOptions, initLocalController, setLocalController } from '../src/game/localSession';

const classic = RULESETS['classic']!;
const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

function riggedOptions(): HotSeatOptions {
  return {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
    seats: 2,
  };
}

function stageCats(controller: GameController) {
  controller.placeAt({ row: 7, col: 7 }, 0);
  controller.placeAt({ row: 7, col: 8 }, 1);
  controller.placeAt({ row: 7, col: 9 }, 2);
  controller.placeAt({ row: 7, col: 10 }, 3);
}

describe('edge shuffling (T3.8)', () => {
  it('createHotSeatOptions deals a legal permutation of the tile set', () => {
    const opts = createHotSeatOptions();
    const sortedSet = Object.entries(classic.tiles.counts)
      .flatMap(([face, n]) => Array.from({ length: n }, () => face))
      .sort();
    expect([...opts.bagOrder].sort()).toEqual(sortedSet);
    expect(opts.seats).toBe(2);
  });

  it('two games get different bag orders (the shuffle is real)', () => {
    expect(createHotSeatOptions().bagOrder.join('')).not.toBe(
      createHotSeatOptions().bagOrder.join(''),
    );
  });
});

describe('hot-seat persistence (T3.8)', () => {
  it('a full game state survives refresh through localStorage', async () => {
    const storage = new MemoryStorage();
    const opts = riggedOptions();
    const first = new GameController(
      new LocalStorageTransport<HotSeatOptions, LexEntry>(opts, HOTSEAT_STORAGE_KEY, storage),
      opts,
      { dict: stubDict(), rng: () => 0.5 },
    );
    await first.init();
    stageCats(first);
    first.submitPlay();
    await new Promise((r) => setTimeout(r, 0));
    // "Refresh": everything rebuilt from storage; the stored options win.
    const second = new GameController(
      new LocalStorageTransport<HotSeatOptions, LexEntry>(createHotSeatOptions(), HOTSEAT_STORAGE_KEY, storage),
      createHotSeatOptions(),
      { dict: stubDict(), rng: () => 0.5 },
    );
    await second.init();
    const snap = second.getSnapshot();
    expect(snap.state.board.get('7,7')?.letter).toBe('C');
    expect(snap.scores[0]).toBe(12);
    expect(snap.toMove).toBe(1);
    expect(snap.rack.filter(Boolean)).toEqual(P1_RACK);
  });

  it('initLocalController wires storage + dictionary loader and resumes', async () => {
    setLocalController(null);
    const storage = new MemoryStorage();
    const controller = await initLocalController({
      storage,
      loadDict: async () => stubDict(),
      rng: () => 0.5,
    });
    act(() => controller.pass());
    await new Promise((r) => setTimeout(r, 0));
    // Simulate a fresh boot: reset the singleton, same storage.
    setLocalController(null);
    const resumed = await initLocalController({
      storage,
      loadDict: async () => stubDict(),
      rng: () => 0.5,
    });
    expect(resumed.getSnapshot().state.moveCount).toBe(1);
    setLocalController(null);
  });
});

describe('pass-device interstitial (T3.8, DESIGN §7.3)', () => {
  async function renderHotSeat() {
    const opts = riggedOptions();
    const storage = new MemoryStorage();
    const controller = new GameController(
      new LocalStorageTransport<HotSeatOptions, LexEntry>(opts, HOTSEAT_STORAGE_KEY, storage),
      opts,
      { dict: stubDict(), rng: () => 0.5 },
    );
    await controller.init();
    const utils = render(
      <MemoryRouter>
        <HotSeatGame controller={controller} />
      </MemoryRouter>,
    );
    return { controller, ...utils };
  }

  it('covers the rack until tapped, names the player to move', async () => {
    const { controller } = await renderHotSeat();
    const overlay = screen.getByTestId('pass-device');
    expect(overlay.textContent).toMatch(/player 1/i);
    expect(overlay.textContent).toMatch(/tap to see your rack/i);
    fireEvent.click(overlay);
    expect(screen.queryByTestId('pass-device')).toBeFalsy();
    // After a move it comes back for the other player.
    act(() => {
      stageCats(controller);
      controller.submitPlay();
    });
    const again = screen.getByTestId('pass-device');
    expect(again.textContent).toMatch(/player 2/i);
    fireEvent.click(again);
    expect(screen.queryByTestId('pass-device')).toBeFalsy();
  });

  it('reappears on refresh (nobody’s rack is exposed on resume)', async () => {
    const { unmount, controller } = await renderHotSeat();
    fireEvent.click(screen.getByTestId('pass-device'));
    unmount();
    render(
      <MemoryRouter>
        <HotSeatGame controller={controller} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('pass-device')).toBeTruthy();
  });

  it('stays away once the game has ended', async () => {
    const { controller } = await renderHotSeat();
    fireEvent.click(screen.getByTestId('pass-device'));
    act(() => controller.resign(0));
    expect(screen.queryByTestId('pass-device')).toBeFalsy();
  });
});

describe('a four-seat hot-seat table (M7)', () => {
  // The claim the seat picker makes: one device really does deal and hand
  // round a 3-4 player table, not just accept the number on the form.
  const RACKS: TileFace[][] = [
    ['C', 'A', 'T', 'S', 'E', 'R', 'N'],
    ['D', 'O', 'G', 'L', 'I', 'P', 'U'],
    ['M', 'I', 'N', 'E', 'R', 'A', 'L'],
    ['B', 'O', 'X', 'E', 'S', 'T', 'Y'],
  ];

  async function fourSeatController(storage: KeyValueStorage) {
    const options: HotSeatOptions = {
      rulesetId: 'classic',
      dictionaryId: 'stub',
      bagOrder: riggedBagOrder(classic, RACKS),
      seats: 4,
    };
    const controller = new GameController(
      new LocalStorageTransport<HotSeatOptions, LexEntry>(options, HOTSEAT_STORAGE_KEY, storage),
      options,
      { dict: stubDict(), rng: () => 0.5 },
    );
    await controller.init();
    return controller;
  }

  it('deals four racks and scores four seats', async () => {
    const controller = await fourSeatController(new MemoryStorage());
    const snap = controller.getSnapshot();
    expect(snap.scores).toHaveLength(4);
    expect(snap.rack).toHaveLength(classic.rackSize);
    expect(snap.toMove).toBe(0);
  });

  it('passes the device round all four seats in order', async () => {
    const controller = await fourSeatController(new MemoryStorage());
    render(
      <MemoryRouter>
        <HotSeatGame controller={controller} />
      </MemoryRouter>,
    );
    // Seat 0 is behind the handoff screen on first load, as ever.
    expect(screen.getByTestId('pass-device').textContent).toContain('Player 1');
    fireEvent.click(screen.getByTestId('pass-device'));

    // Each pass advances one seat, wrapping back to seat 0 after the fourth.
    for (const name of ['Player 2', 'Player 3', 'Player 4', 'Player 1']) {
      act(() => {
        controller.pass();
      });
      expect(screen.getByTestId('pass-device').textContent).toContain(name);
      fireEvent.click(screen.getByTestId('pass-device'));
    }
    expect(controller.getSnapshot().toMove).toBe(0);
  });
});
