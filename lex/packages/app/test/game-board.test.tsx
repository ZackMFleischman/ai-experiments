// T3.5 gate: the assembled drag layer — rack→board drag with transform-aware
// hit-testing, pending-tile drags, drop-off-board return, tap-tap fallback,
// recall, Esc cancels. Controller state is asserted after every gesture.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RULESETS } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import { GameBoard } from '../src/board/GameBoard';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';

const classic = RULESETS['classic']!;
const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

async function setup() {
  const opts: HotSeatOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
    seats: 2,
  };
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
  const controller = new GameController(transport, opts, { dict: stubDict(), rng: () => 0.5 });
  await controller.init();
  const utils = render(<GameBoard controller={controller} />);
  const viewport = screen.getByTestId('board-viewport');
  const tray = screen.getByTestId('rack-tray');
  // Container 600×400; board 544×544 → fit scale 400/544, tx 100, ty 0.
  viewport.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 }) as DOMRect;
  tray.getBoundingClientRect = () =>
    ({ x: 0, y: 500, left: 0, top: 500, width: 350, height: 60, right: 350, bottom: 560 }) as DOMRect;
  return { controller, viewport, tray, ...utils };
}

/** Client coords of a cell center under the mocked 600×400 viewport. */
function cellClient(row: number, col: number): { clientX: number; clientY: number } {
  const s = 400 / 544;
  const bx = 2 + col * 36 + 18;
  const by = 2 + row * 36 + 18;
  return { clientX: 100 + bx * s, clientY: by * s };
}

describe('GameBoard — tap-tap fallback', () => {
  it('tap a rack tile, tap an empty cell: the tile is staged', async () => {
    const { controller, viewport, tray } = await setup();
    const slot = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 1, clientX: 25, clientY: 530, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 25, clientY: 530 });
    expect(controller.getSnapshot().selection).toBe(0);
    const at = cellClient(7, 7);
    const cellEl = viewport.querySelector('[data-cell="7,7"]') as Element;
    fireEvent.pointerDown(cellEl, { pointerId: 2, ...at, isPrimary: true });
    fireEvent.pointerUp(viewport, { pointerId: 2, ...at });
    const snap = controller.getSnapshot();
    expect(snap.pending.get('7,7')?.letter).toBe('C');
    expect(snap.selection).toBeNull();
    expect(snap.rack[0]).toBeNull();
  });

  it('tapping a staged tile bounces it back to the rack', async () => {
    const { controller, viewport } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    const at = cellClient(7, 7);
    // The tap lands on the pending tile: viewport routes it to the drag layer,
    // and a motionless press+release is a bounce-back.
    const pendingEl = viewport.querySelector('[data-pending="true"]') as Element;
    fireEvent.pointerDown(pendingEl, { pointerId: 3, ...at, isPrimary: true });
    fireEvent.pointerUp(viewport, { pointerId: 3, ...at });
    const snap = controller.getSnapshot();
    expect(snap.pending.size).toBe(0);
    expect(snap.rack[0]).toBe('C');
  });

  it('tap elsewhere (background) clears the selection; Esc too', async () => {
    const { controller, viewport, tray } = await setup();
    const slot = tray.querySelector('[data-rack-slot="1"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 1, clientX: 75, clientY: 530, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 75, clientY: 530 });
    expect(controller.getSnapshot().selection).toBe(1);
    fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 590, clientY: 390, isPrimary: true });
    fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 590, clientY: 390 });
    expect(controller.getSnapshot().selection).toBeNull();
    // Esc clears a fresh selection too.
    fireEvent.pointerDown(slot, { pointerId: 3, clientX: 75, clientY: 530, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 3, clientX: 75, clientY: 530 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(controller.getSnapshot().selection).toBeNull();
  });
});

describe('GameBoard — drag from the rack', () => {
  it('drag a rack tile onto an empty cell stages it', async () => {
    const { controller, tray } = await setup();
    const slot = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 5, clientX: 25, clientY: 530, isPrimary: true });
    // Upward past the tray edge: the tray hands the pointer to the drag layer.
    fireEvent.pointerMove(tray, { pointerId: 5, clientX: 30, clientY: 480 });
    expect(screen.queryByTestId('drag-ghost')).toBeTruthy();
    const at = cellClient(7, 7);
    fireEvent.pointerMove(window, { pointerId: 5, ...at });
    fireEvent.pointerUp(window, { pointerId: 5, ...at });
    const snap = controller.getSnapshot();
    expect(snap.pending.get('7,7')?.letter).toBe('C');
    expect(snap.rack[0]).toBeNull();
    expect(screen.queryByTestId('drag-ghost')).toBeFalsy();
  });

  it('dropping on an occupied or off-board point stages nothing', async () => {
    const { controller, tray } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 1)); // A occupies 7,7
    const slot = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 6, clientX: 25, clientY: 530, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 6, clientX: 30, clientY: 480 });
    const at = cellClient(7, 7);
    fireEvent.pointerMove(window, { pointerId: 6, ...at });
    fireEvent.pointerUp(window, { pointerId: 6, ...at }); // occupied
    let snap = controller.getSnapshot();
    expect(snap.pending.get('7,7')?.letter).toBe('A');
    expect(snap.rack[0]).toBe('C'); // still in the rack
    // Off-board drop:
    fireEvent.pointerDown(slot, { pointerId: 7, clientX: 25, clientY: 530, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 7, clientX: 30, clientY: 480 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 30, clientY: 470 });
    snap = controller.getSnapshot();
    expect(snap.pending.size).toBe(1);
    expect(snap.rack[0]).toBe('C');
  });

  it('Esc mid-drag cancels the drag without staging', async () => {
    const { controller, tray } = await setup();
    const slot = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 8, clientX: 25, clientY: 530, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 8, clientX: 30, clientY: 480 });
    expect(screen.queryByTestId('drag-ghost')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('drag-ghost')).toBeFalsy();
    fireEvent.pointerUp(window, { pointerId: 8, ...cellClient(7, 7) });
    expect(controller.getSnapshot().pending.size).toBe(0);
  });
});

describe('GameBoard — dragging staged tiles', () => {
  it('drag a pending tile to another empty cell moves it', async () => {
    const { controller, viewport } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    const pendingEl = viewport.querySelector('[data-pending="true"]') as Element;
    const from = cellClient(7, 7);
    const to = cellClient(7, 9);
    fireEvent.pointerDown(pendingEl, { pointerId: 9, ...from, isPrimary: true });
    fireEvent.pointerMove(viewport, { pointerId: 9, ...to });
    fireEvent.pointerUp(viewport, { pointerId: 9, ...to });
    const snap = controller.getSnapshot();
    expect(snap.pending.has('7,7')).toBe(false);
    expect(snap.pending.get('7,9')?.letter).toBe('C');
  });

  it('drag a pending tile off the board returns it to the rack', async () => {
    const { controller, viewport } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    const pendingEl = viewport.querySelector('[data-pending="true"]') as Element;
    fireEvent.pointerDown(pendingEl, { pointerId: 10, ...cellClient(7, 7), isPrimary: true });
    fireEvent.pointerMove(viewport, { pointerId: 10, clientX: 50, clientY: 390 });
    fireEvent.pointerUp(viewport, { pointerId: 10, clientX: 50, clientY: 390 });
    const snap = controller.getSnapshot();
    expect(snap.pending.size).toBe(0);
    expect(snap.rack[0]).toBe('C');
  });
});

describe('GameBoard — recall', () => {
  it('the recall button returns every staged tile', async () => {
    const { controller } = await setup();
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 8 }, 1);
    });
    fireEvent.click(screen.getByRole('button', { name: /recall/i }));
    const snap = controller.getSnapshot();
    expect(snap.pending.size).toBe(0);
    expect(snap.rack.filter(Boolean)).toEqual(P0_RACK);
  });
});
