// T3.6 gate: blank letter-picker sheet, exchange multi-select + confirm bar,
// pass (and resign) confirm dialogs.
import { act, fireEvent, render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import { RULESETS } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it, vi } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import { GameActions } from '../src/game/GameActions';
import { GameBoard } from '../src/board/GameBoard';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';

const classic = RULESETS['classic']!;
const P0_RACK: TileFace[] = ['C', 'A', 'T', '?', 'E', 'R', 'N'];
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
  return { controller, transport, ...utils };
}

describe('blank letter picker (T3.6)', () => {
  it('opens when a blank is staged, offers the ruleset alphabet, designates on pick', async () => {
    const { controller } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 3)); // the blank
    const sheet = await screen.findByTestId('blank-picker');
    // Alphabet from the ruleset's tile set (minus the blank itself): 26 letters.
    expect(within(sheet).getAllByRole('button')).toHaveLength(26);
    fireEvent.click(within(sheet).getByRole('button', { name: 'S' }));
    const snap = controller.getSnapshot();
    expect(snap.pending.get('7,7')).toMatchObject({ letter: 'S', isBlank: true });
    await waitForElementToBeRemoved(() => screen.queryByTestId('blank-picker'));
  });
});

describe('exchange mode (T3.6)', () => {
  it('begin → tap tiles to select → confirm submits the exchange', async () => {
    const { controller, transport } = await setup();
    act(() => controller.beginExchange());
    expect(controller.getSnapshot().exchange).not.toBeNull();
    act(() => {
      controller.toggleExchange(0);
      controller.toggleExchange(1);
    });
    const bar = screen.getByTestId('exchange-bar');
    expect(bar.textContent).toMatch(/exchange 2 tiles/i);
    expect(bar.textContent).toMatch(/costs your turn/i);
    fireEvent.click(within(bar).getByRole('button', { name: /exchange/i }));
    await new Promise((r) => setTimeout(r, 0));
    const entry = (await transport.load())?.log[0] as Extract<LexEntry, { kind: 'exchange' }>;
    expect(entry.kind).toBe('exchange');
    expect(entry.tiles).toEqual(['C', 'A']);
    expect(controller.getSnapshot().exchange).toBeNull();
    expect(controller.getSnapshot().toMove).toBe(1);
  });

  it('rack taps toggle selection while in exchange mode; cancel exits cleanly', async () => {
    const { controller } = await setup();
    act(() => controller.beginExchange());
    const tray = screen.getByTestId('rack-tray');
    tray.getBoundingClientRect = () =>
      ({ x: 0, y: 500, left: 0, top: 500, width: 350, height: 60, right: 350, bottom: 560 }) as DOMRect;
    const slot = tray.querySelector('[data-rack-slot="2"]') as Element;
    fireEvent.pointerDown(slot, { pointerId: 1, clientX: 125, clientY: 530, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 1, clientX: 125, clientY: 530 });
    expect([...(controller.getSnapshot().exchange ?? [])]).toEqual([2]);
    expect(slot.getAttribute('data-exchange-selected')).toBe('true');
    // Tapping again deselects.
    fireEvent.pointerDown(slot, { pointerId: 2, clientX: 125, clientY: 530, isPrimary: true });
    fireEvent.pointerUp(tray, { pointerId: 2, clientX: 125, clientY: 530 });
    expect([...(controller.getSnapshot().exchange ?? [])]).toEqual([]);
    const bar = screen.getByTestId('exchange-bar');
    fireEvent.click(within(bar).getByRole('button', { name: /cancel/i }));
    expect(controller.getSnapshot().exchange).toBeNull();
    expect(controller.getSnapshot().toMove).toBe(0); // no turn spent
  });

  it('beginning an exchange recalls staged tiles first', async () => {
    const { controller } = await setup();
    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    act(() => controller.beginExchange());
    const snap = controller.getSnapshot();
    expect(snap.pending.size).toBe(0);
    expect(snap.rack.filter(Boolean)).toHaveLength(7);
  });
});

describe('GameActions (pure) — pass/resign confirms, exchange availability', () => {
  function renderActions(overrides: Partial<Parameters<typeof GameActions>[0]> = {}) {
    const props = {
      playable: false,
      hasPending: false,
      interactive: true,
      canExchange: true,
      exchangeMinBag: classic.exchangeMinBag,
      bagCount: 86,
      onPlay: vi.fn(),
      onRecall: vi.fn(),
      onExchange: vi.fn(),
      onPass: vi.fn(),
      onResign: vi.fn(),
      ...overrides,
    };
    render(<GameActions {...props} />);
    return props;
  }

  it('Pass asks for confirmation before passing', () => {
    const props = renderActions();
    fireEvent.click(screen.getByRole('button', { name: /^pass$/i }));
    expect(props.onPass).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/pass/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /pass/i }));
    expect(props.onPass).toHaveBeenCalledOnce();
  });

  it('Resign lives in the overflow menu and asks for confirmation', () => {
    const props = renderActions();
    // Resign is not in the primary row — it's behind the ⋯ menu.
    expect(screen.queryByRole('button', { name: /resign/i })).toBeNull();
    fireEvent.click(screen.getByTestId('more-actions'));
    fireEvent.click(screen.getByTestId('resign-action'));
    expect(props.onResign).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /resign/i }));
    expect(props.onResign).toHaveBeenCalledOnce();
  });

  // T7.14: at 3+ seats leaving is a withdrawal — the player is out, their
  // score freezes, and play carries on — so "this ends the game" is a lie.
  it('calls leaving a withdrawal at three or more seats', () => {
    const props = renderActions({ seats: 3 });
    fireEvent.click(screen.getByTestId('more-actions'));
    expect(screen.getByTestId('resign-action').textContent).toMatch(/withdraw/i);
    fireEvent.click(screen.getByTestId('resign-action'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/withdraw from the game\?/i);
    expect(dialog.textContent).toMatch(/the others play on/i);
    expect(dialog.textContent).not.toMatch(/opponent wins/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /withdraw/i }));
    expect(props.onResign).toHaveBeenCalledOnce();
  });

  it('keeps the two-seat resign wording word for word', () => {
    renderActions({ seats: 2 });
    fireEvent.click(screen.getByTestId('more-actions'));
    expect(screen.getByTestId('resign-action').textContent).toBe('Resign');
    fireEvent.click(screen.getByTestId('resign-action'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Resign the game?');
    expect(dialog.textContent).toContain('Your opponent wins immediately.');
  });

  it('Exchange is disabled with a reason when the bag is short', () => {
    renderActions({ canExchange: false, bagCount: 5 });
    const button = screen.getByRole('button', { name: /exchange/i });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByTestId('exchange-reason').textContent).toMatch(/7/);
  });

  it('Play is enabled only when the preview says so', () => {
    const props = renderActions({ playable: true, hasPending: true });
    const play = screen.getByRole('button', { name: /play/i });
    expect(play).toHaveProperty('disabled', false);
    fireEvent.click(play);
    expect(props.onPlay).toHaveBeenCalledOnce();
  });

  it('plays instantly by default — no confirm dialog', () => {
    const props = renderActions({ playable: true, hasPending: true });
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(props.onPlay).toHaveBeenCalledOnce();
  });

  it('confirmBeforePlay routes Play through a confirm dialog first', () => {
    const props = renderActions({ playable: true, hasPending: true, confirmBeforePlay: true, playScore: 24 });
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(props.onPlay).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/\+24/);
    fireEvent.click(within(dialog).getByRole('button', { name: /^play$/i }));
    expect(props.onPlay).toHaveBeenCalledOnce();
  });
});
