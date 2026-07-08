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

// Drops land at the cell under the FINGER — the ghost snaps into that cell
// while dragging, so the finger aims at the cell itself.

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
  it('drag a rack tile onto an empty cell stages it (drop lands under the finger)', async () => {
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

  it('a rack drag dropped back on the tray reorders — with the insertion previewed live', async () => {
    const { controller, tray } = await setup();
    const slot = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 14, clientX: 25, clientY: 530, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 14, clientX: 30, clientY: 480 }); // hand-off
    // Back down over the tray at slot 2's x: the rack previews the splice.
    fireEvent.pointerMove(window, { pointerId: 14, clientX: 125, clientY: 530 });
    const slot1 = tray.querySelector('[data-rack-slot="1"]') as HTMLElement;
    expect(slot1.style.transform).toBe('translateX(-50px)');
    fireEvent.pointerUp(window, { pointerId: 14, clientX: 125, clientY: 530 });
    const snap = controller.getSnapshot();
    expect(snap.rack).toEqual(['A', 'T', 'C', 'S', 'E', 'R', 'N']);
    expect(snap.pending.size).toBe(0);
    expect(slot1.style.transform).toBe('');
  });

  it('drops into the slot under the finger on a wide window (real pitch, not row/rackSize)', async () => {
    // Regression (desktop): the tray row stretches far past the tiles, so
    // mapping the whole row width to rackSize slots dropped the ghost in the
    // wrong slot. Row 700px wide but slots 52px (+4px gap → 56px pitch,
    // centered → slot 0 at x=156). clientX 250 is over slot 1 by the real
    // geometry; the old row/rackSize math (100px pitch from x=0) read it as 2.
    const { controller, tray } = await setup();
    const row = tray.querySelector('[data-rack-row]') as HTMLElement;
    row.getBoundingClientRect = () =>
      ({ x: 0, y: 500, left: 0, top: 500, width: 700, height: 56, right: 700, bottom: 556 }) as DOMRect;
    row.querySelectorAll('[data-rack-slot]').forEach((s) => {
      (s as HTMLElement).getBoundingClientRect = () =>
        ({ x: 0, y: 500, left: 0, top: 500, width: 52, height: 52, right: 52, bottom: 552 }) as DOMRect;
    });
    const slot = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 21, clientX: 156, clientY: 530, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 21, clientX: 160, clientY: 480 }); // hand-off
    fireEvent.pointerMove(window, { pointerId: 21, clientX: 250, clientY: 530 });
    fireEvent.pointerUp(window, { pointerId: 21, clientX: 250, clientY: 530 });
    expect(controller.getSnapshot().rack).toEqual(['A', 'C', 'T', 'S', 'E', 'R', 'N']);
  });
});

describe('GameBoard — dragging staged tiles', () => {
  it('drag a pending tile to another empty cell moves it (drop lands under the finger)', async () => {
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

  it('drag a pending tile onto the tray inserts it at that slot — reorder mode, seamlessly', async () => {
    const { controller, viewport, tray } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0)); // C leaves slot 0
    const pendingEl = viewport.querySelector('[data-pending="true"]') as Element;
    fireEvent.pointerDown(pendingEl, { pointerId: 15, ...cellClient(7, 7), isPrimary: true });
    // Down over the tray at slot 3's x: the ghost stays with the finger and
    // the rack previews the insertion.
    fireEvent.pointerMove(viewport, { pointerId: 15, clientX: 175, clientY: 530 });
    expect(screen.getByTestId('drag-ghost')).toBeTruthy();
    // The tile would land in slot 0's hole then splice to 3: A/T/S slide left.
    const slot1 = tray.querySelector('[data-rack-slot="1"]') as HTMLElement;
    expect(slot1.style.transform).toBe('translateX(-50px)');
    fireEvent.pointerUp(viewport, { pointerId: 15, clientX: 175, clientY: 530 });
    const snap = controller.getSnapshot();
    expect(snap.pending.size).toBe(0);
    expect(snap.rack).toEqual(['A', 'T', 'S', 'C', 'E', 'R', 'N']);
  });
});

describe('GameBoard — drag ghosts (the tile stays visible under your finger)', () => {
  it('a staged-tile drag lifts the tile out of its cell into a following ghost', async () => {
    const { controller, viewport } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    const pendingEl = viewport.querySelector('[data-pending="true"]') as Element;
    fireEvent.pointerDown(pendingEl, { pointerId: 11, ...cellClient(7, 7), isPrimary: true });
    fireEvent.pointerMove(viewport, { pointerId: 11, ...cellClient(7, 9) });
    // The ghost carries the letter; the source cell is empty while dragging.
    expect(screen.getByTestId('drag-ghost').textContent).toContain('C');
    expect(viewport.querySelector('[data-cell="7,7"] [data-tile]')).toBeNull();
    fireEvent.pointerUp(viewport, { pointerId: 11, ...cellClient(7, 9) });
    expect(screen.queryByTestId('drag-ghost')).toBeFalsy();
    expect(viewport.querySelector('[data-cell="7,9"] [data-tile]')).toBeTruthy();
    expect(controller.getSnapshot().pending.get('7,9')?.letter).toBe('C');
  });

  it('an aborted staged-tile drag (drop off-board) clears the ghost too', async () => {
    const { controller, viewport } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    const pendingEl = viewport.querySelector('[data-pending="true"]') as Element;
    fireEvent.pointerDown(pendingEl, { pointerId: 12, ...cellClient(7, 7), isPrimary: true });
    fireEvent.pointerMove(viewport, { pointerId: 12, clientX: 50, clientY: 390 });
    expect(screen.getByTestId('drag-ghost')).toBeTruthy();
    fireEvent.pointerUp(viewport, { pointerId: 12, clientX: 50, clientY: 390 });
    expect(screen.queryByTestId('drag-ghost')).toBeFalsy();
    expect(controller.getSnapshot().rack[0]).toBe('C'); // returned home
  });

  it('over a free cell the ghost snaps into the cell it will land in', async () => {
    const { controller, viewport } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    const pendingEl = viewport.querySelector('[data-pending="true"]') as Element;
    fireEvent.pointerDown(pendingEl, { pointerId: 16, ...cellClient(7, 7), isPrimary: true });
    // On pickup the ghost snaps into its own cell — it appears in place.
    expect(screen.getByTestId('drag-ghost').getAttribute('data-snapped')).toBe('true');
    fireEvent.pointerMove(viewport, { pointerId: 16, ...cellClient(7, 9) });
    const ghost = screen.getByTestId('drag-ghost');
    expect(ghost.getAttribute('data-snapped')).toBe('true');
    // Snapped geometry = the cell's client rect (origin + viewport scale).
    const s = 400 / 544;
    expect(parseFloat(ghost.style.left)).toBeCloseTo(100 + (2 + 9 * 36) * s, 3);
    expect(parseFloat(ghost.style.top)).toBeCloseTo((2 + 7 * 36) * s, 3);
    expect(ghost.style.transform).toBe(`scale(${s})`);
    fireEvent.pointerUp(viewport, { pointerId: 16, ...cellClient(7, 9) });
    expect(controller.getSnapshot().pending.get('7,9')?.letter).toBe('C');
  });

  it('over an occupied cell the ghost does not snap, and release sends the tile home', async () => {
    const { controller, viewport } = await setup();
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0); // C
      controller.placeAt({ row: 7, col: 8 }, 1); // A
    });
    const pendingEl = viewport.querySelector('[data-cell="7,7"] [data-pending="true"]') as Element;
    fireEvent.pointerDown(pendingEl, { pointerId: 17, ...cellClient(7, 7), isPrimary: true });
    const at = cellClient(7, 8);
    fireEvent.pointerMove(viewport, { pointerId: 17, ...at });
    // No snap target: the ghost rides free, centered under the finger.
    const ghost = screen.getByTestId('drag-ghost');
    expect(ghost.getAttribute('data-snapped')).toBeNull();
    expect(parseFloat(ghost.style.left)).toBeCloseTo(at.clientX - 18, 3);
    expect(parseFloat(ghost.style.top)).toBeCloseTo(at.clientY - 18, 3);
    fireEvent.pointerUp(viewport, { pointerId: 17, ...at });
    const snap = controller.getSnapshot();
    expect(snap.pending.has('7,7')).toBe(false);
    expect(snap.pending.get('7,8')?.letter).toBe('A'); // the occupant is untouched
    expect(snap.rack[0]).toBe('C'); // nothing snapped → the tile went home
  });

  it('a rack drag empties the source slot while the ghost is up, and restores it on cancel', async () => {
    const { tray } = await setup();
    const slot = tray.querySelector('[data-rack-slot="0"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 13, clientX: 25, clientY: 530, isPrimary: true });
    fireEvent.pointerMove(tray, { pointerId: 13, clientX: 30, clientY: 480 });
    expect(screen.getByTestId('drag-ghost').textContent).toContain('C');
    expect(tray.querySelector('[data-rack-slot="0"] [data-tile]')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tray.querySelector('[data-rack-slot="0"] [data-tile]')).toBeTruthy();
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
