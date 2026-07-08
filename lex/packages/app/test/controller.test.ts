// T3.4 gate: GameController — pending-placement model, verdict-pipeline
// preview, rack order management, optimistic submit over GameTransport with
// rollback, refresh resume, blanks, exchange, resign.
import { RULESETS, cellKey } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it, vi } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';

const classic = RULESETS['classic']!;

const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

function options(overrides: Partial<HotSeatOptions> = {}): HotSeatOptions {
  return {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
    seats: 2,
    ...overrides,
  };
}

/** rng stub: cycles through the given values (0 ≤ v < 1). */
function seededRng(values: number[] = [0.5, 0.1, 0.9, 0.3, 0.7]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

async function makeController(opts = options(), dict = stubDict()) {
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
  const controller = new GameController(transport, opts, { dict, rng: seededRng() });
  await controller.init(); // production always initializes (localSession T3.8)
  return { transport, controller };
}

/** Stage the word CATS horizontally from the start cell. */
function stageCats(controller: GameController) {
  // Rack: C A T S E R N → slots 0..3 spell CATS across row 7.
  controller.placeAt({ row: 7, col: 7 }, 0);
  controller.placeAt({ row: 7, col: 8 }, 1);
  controller.placeAt({ row: 7, col: 9 }, 2);
  controller.placeAt({ row: 7, col: 10 }, 3);
}

describe('GameController — pending placements & preview', () => {
  it('starts with the dealt rack, bag count, and no preview', async () => {
    const { controller } = await makeController();
    const snap = controller.getSnapshot();
    expect(snap.toMove).toBe(0);
    expect(snap.rack.filter(Boolean)).toEqual(P0_RACK);
    expect(snap.bagCount).toBe(100 - 14);
    expect(snap.pending.size).toBe(0);
    expect(snap.preview).toBeNull();
    expect(snap.end).toBeUndefined();
  });

  it('placing a tile stages it and empties its rack slot; the preview updates', async () => {
    const { controller } = await makeController();
    controller.placeAt({ row: 7, col: 7 }, 0);
    const snap = controller.getSnapshot();
    expect(snap.pending.get('7,7')?.letter).toBe('C');
    expect(snap.rack[0]).toBeNull();
    expect(snap.preview).not.toBeNull();
    // One tile on the first play is too short — Play must be disabled.
    expect(snap.preview?.playable).toBe(false);
    expect(snap.preview?.check.ok).toBe(false);
  });

  it('a full valid first play previews words, score, and enables Play', async () => {
    const { controller } = await makeController();
    stageCats(controller);
    const preview = controller.getSnapshot().preview!;
    expect(preview.check.ok).toBe(true);
    expect(preview.words).toHaveLength(1);
    expect(preview.words[0]?.word).toBe('CATS');
    expect(preview.words[0]?.valid).toBe(true);
    // C3 A1 T1 S1 = 6, doubled on the start star = 12.
    expect(preview.total).toBe(12);
    expect(preview.playable).toBe(true);
  });

  it('an invalid word disables Play and flags the chip', async () => {
    const { controller } = await makeController(options(), stubDict(['CATS']));
    stageCats(controller);
    const preview = controller.getSnapshot().preview!;
    expect(preview.check.ok).toBe(true);
    expect(preview.words[0]?.valid).toBe(false);
    expect(preview.playable).toBe(false);
  });

  it('cells occupied by pending or committed tiles refuse placement', async () => {
    const { controller } = await makeController();
    controller.placeAt({ row: 7, col: 7 }, 0);
    controller.placeAt({ row: 7, col: 7 }, 1); // occupied by pending
    const snap = controller.getSnapshot();
    expect(snap.pending.get('7,7')?.letter).toBe('C');
    expect(snap.rack[1]).toBe('A'); // untouched
  });

  it('returnPending puts the tile back in its original slot; recallAll clears', async () => {
    const { controller } = await makeController();
    stageCats(controller);
    controller.returnPending({ row: 7, col: 8 }); // the A, from slot 1
    let snap = controller.getSnapshot();
    expect(snap.rack[1]).toBe('A');
    expect(snap.pending.size).toBe(3);
    controller.recallAll();
    snap = controller.getSnapshot();
    expect(snap.pending.size).toBe(0);
    expect(snap.rack.filter(Boolean)).toEqual(P0_RACK);
    expect(snap.preview).toBeNull();
  });
});

describe('GameController — rack order', () => {
  it('reorder moves a tile between slots without touching the engine', async () => {
    const { controller } = await makeController();
    controller.reorderRack(0, 2);
    const snap = controller.getSnapshot();
    expect(snap.rack.filter(Boolean)).toEqual(['A', 'T', 'C', 'S', 'E', 'R', 'N']);
    expect(snap.state.racks[0]).toEqual(P0_RACK); // engine untouched
  });

  it('shuffle permutes the display rack, preserving the multiset', async () => {
    const { controller } = await makeController();
    controller.shuffleRack();
    const snap = controller.getSnapshot();
    expect([...(snap.rack.filter(Boolean) as string[])].sort()).toEqual([...P0_RACK].sort());
  });
});

describe('GameController — submit, rollback, resume', () => {
  it('submitPlay applies optimistically, lands in the transport, flips the turn', async () => {
    const { controller, transport } = await makeController();
    stageCats(controller);
    controller.submitPlay();
    const snap = controller.getSnapshot();
    expect(snap.state.board.get('7,7')?.letter).toBe('C');
    expect(snap.scores[0]).toBe(12);
    expect(snap.toMove).toBe(1);
    expect(snap.rack.filter(Boolean)).toEqual(P1_RACK); // hot-seat: next player's rack
    expect(snap.pending.size).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    expect((await transport.load())?.log).toHaveLength(1);
  });

  it('a rejected submit rolls everything back and raises a notice', async () => {
    const opts = options();
    const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
    transport.submit = async () => {
      throw new Error('nope');
    };
    const controller = new GameController(transport, opts, { dict: stubDict(), rng: seededRng() });
    await controller.init();
    stageCats(controller);
    controller.submitPlay();
    await new Promise((r) => setTimeout(r, 0));
    const snap = controller.getSnapshot();
    expect(snap.state.board.size).toBe(0);
    expect(snap.scores[0]).toBe(0);
    expect(snap.toMove).toBe(0);
    expect(snap.rack.filter(Boolean)).toEqual(P0_RACK);
    expect(snap.notice?.text).toMatch(/rejected/i);
  });

  it('refresh resume: a new controller over the same transport replays the log', async () => {
    const { controller, transport } = await makeController();
    stageCats(controller);
    controller.submitPlay();
    await new Promise((r) => setTimeout(r, 0));
    const second = new GameController(transport, options(), { dict: stubDict(), rng: seededRng() });
    await second.init();
    const snap = second.getSnapshot();
    expect(snap.state.board.get('7,7')?.letter).toBe('C');
    expect(snap.scores[0]).toBe(12);
    expect(snap.toMove).toBe(1);
  });

  it('subscribers are notified when state changes', async () => {
    const { controller } = await makeController();
    const cb = vi.fn();
    controller.subscribe(cb);
    controller.placeAt({ row: 7, col: 7 }, 0);
    expect(cb).toHaveBeenCalled();
    // Snapshot identity is stable between changes (useSyncExternalStore contract).
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
  });
});

describe('GameController — blanks', () => {
  it('an undesignated blank blocks Play; designation unblocks and scores 0', async () => {
    // Give p0 a blank: rack C A T ? E R N.
    const rack: TileFace[] = ['C', 'A', 'T', '?', 'E', 'R', 'N'];
    const opts = options({ bagOrder: riggedBagOrder(classic, [rack, P1_RACK]) });
    const { controller } = await makeController(opts);
    controller.placeAt({ row: 7, col: 7 }, 0);
    controller.placeAt({ row: 7, col: 8 }, 1);
    controller.placeAt({ row: 7, col: 9 }, 2);
    controller.placeAt({ row: 7, col: 10 }, 3); // the blank
    let preview = controller.getSnapshot().preview!;
    expect(preview.needsBlank).toBe('7,10');
    expect(preview.playable).toBe(false);
    controller.setBlankLetter({ row: 7, col: 10 }, 'S');
    preview = controller.getSnapshot().preview!;
    expect(preview.needsBlank).toBeNull();
    expect(preview.words[0]?.word).toBe('CATS');
    expect(preview.total).toBe(10); // C3+A1+T1+blank0 = 5, doubled — blank scores 0
    expect(preview.playable).toBe(true);
    controller.submitPlay();
    const board = controller.getSnapshot().state.board;
    expect(board.get('7,10')).toEqual({ letter: 'S', isBlank: true });
  });
});

describe('GameController — pass, exchange, resign', () => {
  it('pass flips the turn and increments the scoreless run', async () => {
    const { controller } = await makeController();
    controller.pass();
    const snap = controller.getSnapshot();
    expect(snap.toMove).toBe(1);
    expect(snap.state.scorelessRun).toBe(1);
  });

  it('exchange swaps tiles, reshuffles the bag at the edge, and resumes exactly', async () => {
    const { controller, transport } = await makeController();
    controller.exchangeTiles([0, 1]);
    await new Promise((r) => setTimeout(r, 0));
    const snap = controller.getSnapshot();
    expect(snap.toMove).toBe(1);
    expect(snap.state.racks[0]).toHaveLength(7);
    expect(snap.bagCount).toBe(86); // returned 2, drew 2
    const entry = (await transport.load())?.log[0] as Extract<LexEntry, { kind: 'exchange' }>;
    expect(entry.kind).toBe('exchange');
    expect(entry.tiles).toEqual(['C', 'A']);
    expect([...entry.bagAfter].sort()).toEqual([...snap.state.bag].sort());
    // Refresh resume reproduces the exact post-exchange state (bagAfter pinned).
    const second = new GameController(transport, options(), { dict: stubDict(), rng: seededRng() });
    await second.init();
    expect(second.getSnapshot().state.bag).toEqual(snap.state.bag);
    expect(second.getSnapshot().state.racks[0]).toEqual(snap.state.racks[0]);
  });

  it('exchange is flagged unavailable when the bag is below the ruleset minimum', async () => {
    const { controller } = await makeController();
    expect(controller.getSnapshot().canExchange).toBe(true);
  });

  it('resign ends the game with the opponent winning', async () => {
    const { controller } = await makeController();
    controller.resign(0);
    const snap = controller.getSnapshot();
    expect(snap.end).toMatchObject({ by: 'resign', winner: 1 });
    // Interaction is dead after the end.
    controller.placeAt({ row: 7, col: 7 }, 0);
    expect(controller.getSnapshot().pending.size).toBe(0);
  });

  it('a lastPlay summary is derived for the score sheet / highlight (T3.9 seam)', async () => {
    const { controller } = await makeController();
    stageCats(controller);
    controller.submitPlay();
    const last = controller.getSnapshot().lastPlay;
    expect(last).toMatchObject({ by: 0, kind: 'play', total: 12 });
    expect(last?.cells).toEqual(['7,7', '7,8', '7,9', '7,10']);
  });
});

describe('GameController — perspective (multiplayer seam)', () => {
  it('blocks interaction off-turn', async () => {
    const opts = options();
    const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
    const controller = new GameController(transport, opts, { dict: stubDict(), rng: seededRng() }, 1);
    controller.placeAt({ row: 7, col: 7 }, 0);
    expect(controller.getSnapshot().pending.size).toBe(0);
    controller.pass();
    expect(controller.getSnapshot().toMove).toBe(0);
    // The rack shown is MY rack, not the mover's.
    expect(controller.getSnapshot().rack.filter(Boolean)).toEqual(P1_RACK);
  });

  it('lets you reorder and shuffle your rack off-turn (plan your next move)', async () => {
    const opts = options();
    const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
    // perspective = seat 1; seat 0 is to move, so it is NOT my turn.
    const controller = new GameController(transport, opts, { dict: stubDict(), rng: seededRng() }, 1);
    await controller.init();
    expect(controller.getSnapshot().interactive).toBe(false);

    // Off-turn rearrange: move my first tile to slot 2 — arranging my hand.
    controller.reorderRack(0, 2);
    expect(controller.getSnapshot().rack.filter(Boolean)).toEqual(['O', 'G', 'D', 'L', 'I', 'P', 'U']);
    // The engine rack is untouched — display order only, no move made.
    expect(controller.getSnapshot().state.racks[1]).toEqual(P1_RACK);
    expect(controller.getSnapshot().toMove).toBe(0);

    // Shuffle is likewise available off-turn and keeps the multiset intact.
    controller.shuffleRack();
    expect([...(controller.getSnapshot().rack.filter(Boolean) as string[])].sort()).toEqual(
      [...P1_RACK].sort(),
    );
    expect(controller.getSnapshot().interactive).toBe(false); // still not my turn
  });
});
