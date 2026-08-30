// Hot-seat setup (DESIGN §7.1): the one-device game gets a creation form, so
// board / dictionary / invalid-words are reachable without a backend — which
// is also the only way the options can be exercised in a PR preview, since a
// preview deploys the static build alone.
//
// The two hazards this file exists to pin are both about the DICTIONARY being
// injected at controller construction: switching it needs a new controller,
// and the stored log of the previous game must not be replayed through it.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RULESETS } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalStorageTransport, type KeyValueStorage } from '@parlor/core';
import { describe, expect, it, vi } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { HotSeatSetup } from '../src/game/HotSeatSetup';
import {
  HOTSEAT_STORAGE_KEY,
  createHotSeatOptions,
  hasStoredGame,
  startLocalGame,
  setLocalController,
} from '../src/game/localSession';

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

describe('HotSeatSetup form', () => {
  function setup(onCancel?: () => void) {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <HotSeatSetup onStart={onStart} {...(onCancel ? { onCancel } : {})} />
      </MemoryRouter>,
    );
    return onStart;
  }

  it('offers board, dictionary and invalid-words, and starts with the defaults', () => {
    const onStart = setup();
    expect(screen.getAllByTestId('mini-board').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('dictionary-enable1')).toBeTruthy();
    expect(screen.getByTestId('invalid-words-costs-turn')).toBeTruthy();
    fireEvent.click(screen.getByTestId('start-hotseat'));
    expect(onStart).toHaveBeenCalledWith({
      rulesetId: 'classic',
      dictionaryId: 'nwl2023',
      invalidWords: 'blocked',
      seats: 2,
    });
  });

  it('carries every pick through to onStart', () => {
    const onStart = setup();
    fireEvent.click(screen.getByTestId('board-modern'));
    fireEvent.click(screen.getByTestId('dictionary-2of12inf'));
    fireEvent.click(screen.getByTestId('invalid-words-costs-turn'));
    fireEvent.click(screen.getByTestId('start-hotseat'));
    expect(onStart).toHaveBeenCalledWith({
      rulesetId: 'modern',
      dictionaryId: '2of12inf',
      invalidWords: 'costs-turn',
      seats: 2,
    });
  });

  it('offers "keep playing" only when there is a game to keep', () => {
    setup();
    expect(screen.queryByTestId('setup-cancel')).toBeNull();
  });

  it('states the same invalid-words rule as the multiplayer form', () => {
    setup();
    // The shared copy constants are the point: one source, two forms.
    expect(screen.getByText(/checked as you place it/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('invalid-words-costs-turn'));
    expect(screen.getByText(/costs your turn/i)).toBeTruthy();
  });
});

describe('hot-seat seat count', () => {
  function setup() {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <HotSeatSetup onStart={onStart} />
      </MemoryRouter>,
    );
    return onStart;
  }

  it('offers every count the board allows and starts at two', () => {
    setup();
    // classic seats 2-4, so the row is exactly those three.
    expect(screen.getByTestId('count-2')).toBeTruthy();
    expect(screen.getByTestId('count-3')).toBeTruthy();
    expect(screen.getByTestId('count-4')).toBeTruthy();
    expect(screen.queryByTestId('count-5')).toBeNull();
    expect(screen.getByTestId('count-2').getAttribute('aria-pressed')).toBe('true');
  });

  it('carries a chosen count through to onStart', () => {
    const onStart = setup();
    fireEvent.click(screen.getByTestId('count-4'));
    fireEvent.click(screen.getByTestId('start-hotseat'));
    expect(onStart).toHaveBeenCalledWith({
      rulesetId: 'classic',
      dictionaryId: 'nwl2023',
      invalidWords: 'blocked',
      seats: 4,
    });
  });

  it('says how the device moves at three or more, not "two players"', () => {
    setup();
    expect(screen.queryByText(/two players/i)).toBeNull();
    fireEvent.click(screen.getByTestId('count-4'));
    // The handoff line should name the table size it now describes.
    expect(screen.getByText(/4 players/i)).toBeTruthy();
  });
});

describe('startLocalGame', () => {
  it('starts a game under the chosen options and makes it the session', async () => {
    setLocalController(null);
    const storage = new MemoryStorage();
    const controller = await startLocalGame(
      { rulesetId: 'modern', dictionaryId: '2of12inf', invalidWords: 'costs-turn', seats: 2 },
      { storage, loadDict: async () => stubDict(), rng: () => 0.5 },
    );
    const snap = controller.getSnapshot();
    expect(snap.options.rulesetId).toBe('modern');
    expect(snap.options.dictionaryId).toBe('2of12inf');
    expect(snap.options.invalidWords).toBe('costs-turn');
    expect(snap.state.moveCount).toBe(0);
    expect(hasStoredGame(storage)).toBe(true);
    setLocalController(null);
  });

  it('replaces a stored game played under a STRICTER-superset dictionary', async () => {
    // The ordering hazard: the previous log holds a word the NEW dictionary
    // rejects. Reloading before resetting would replay it through the new
    // dictionary and throw, so startLocalGame resets first.
    setLocalController(null);
    const storage = new MemoryStorage();
    const opts: HotSeatOptions = {
      rulesetId: 'classic',
      dictionaryId: 'wide',
      bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
      seats: 2,
    };
    const first = new GameController(
      new LocalStorageTransport<HotSeatOptions, LexEntry>(opts, HOTSEAT_STORAGE_KEY, storage),
      opts,
      { dict: stubDict(), rng: () => 0.5 },
    );
    await first.init();
    act(() => {
      first.placeAt({ row: 7, col: 7 }, 0);
      first.placeAt({ row: 7, col: 8 }, 1);
      first.placeAt({ row: 7, col: 9 }, 2);
      first.placeAt({ row: 7, col: 10 }, 3);
      first.submitPlay();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(first.getSnapshot().state.board.size).toBe(4);

    // Now start over under a dictionary that refuses the word already played.
    const next = await startLocalGame(
      { rulesetId: 'classic', dictionaryId: 'narrow', invalidWords: 'blocked', seats: 2 },
      { storage, loadDict: async () => stubDict(['CATS']), rng: () => 0.5 },
    );
    const snap = next.getSnapshot();
    expect(snap.state.board.size).toBe(0);
    expect(snap.state.moveCount).toBe(0);
    expect(snap.options.dictionaryId).toBe('narrow');
    setLocalController(null);
  });
});

describe('hot-seat options survive a rematch', () => {
  it('createHotSeatOptions carries every setting when handed a game’s options', () => {
    const played = createHotSeatOptions({
      rulesetId: 'modern',
      dictionaryId: '2of12inf',
      invalidWords: 'costs-turn',
    });
    // A rematch re-deals from the finished game's own options — the bag is
    // fresh, everything else is identical. (Listing fields by hand here is
    // exactly how the setting used to get dropped.)
    const rematch = createHotSeatOptions(played);
    expect(rematch.rulesetId).toBe('modern');
    expect(rematch.dictionaryId).toBe('2of12inf');
    expect(rematch.invalidWords).toBe('costs-turn');
    expect(rematch.bagOrder.join('')).not.toBe(played.bagOrder.join(''));
  });

  it('defaults stay put when nothing is passed', () => {
    const opts = createHotSeatOptions();
    expect(opts.rulesetId).toBe('classic');
    expect(opts.dictionaryId).toBe('nwl2023');
    expect(opts.invalidWords).toBe('blocked');
    expect(opts.seats).toBe(2);
  });

  it('deals the chosen number of seats, and carries it through a rematch', () => {
    const played = createHotSeatOptions({ seats: 4 });
    expect(played.seats).toBe(4);
    // Same hazard as the other settings: a rematch must not quietly reseat
    // the table back to two.
    expect(createHotSeatOptions(played).seats).toBe(4);
  });

  it('refuses a count the board cannot seat', () => {
    // The range is engine data (Ruleset.players), so this is the engine's
    // verdict, not a UI constant.
    expect(() => createHotSeatOptions({ seats: 5 })).toThrow(/seat/i);
    expect(() => createHotSeatOptions({ seats: 1 })).toThrow(/seat/i);
  });
});

describe('hasStoredGame', () => {
  it('is false for empty, junk, and malformed storage; true for a real game', async () => {
    const storage = new MemoryStorage();
    expect(hasStoredGame(storage)).toBe(false);
    storage.setItem(HOTSEAT_STORAGE_KEY, 'not json');
    expect(hasStoredGame(storage)).toBe(false);
    storage.setItem(HOTSEAT_STORAGE_KEY, JSON.stringify({ options: null, log: [] }));
    expect(hasStoredGame(storage)).toBe(false);
    setLocalController(null);
    await startLocalGame(
      { rulesetId: 'classic', dictionaryId: 'stub', invalidWords: 'blocked', seats: 2 },
      { storage, loadDict: async () => stubDict(), rng: () => 0.5 },
    );
    await waitFor(() => expect(hasStoredGame(storage)).toBe(true));
    setLocalController(null);
  });
});
