// T3.9 gate: score sheet drawer (per-turn word + score + running totals),
// last-play highlight, and the play animate-in hooks.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { RULESETS } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import { GameBoard } from '../src/board/GameBoard';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { ScoreSheet } from '../src/game/ScoreSheet';

const classic = RULESETS['classic']!;
const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

async function makeController() {
  const opts: HotSeatOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
    seats: 2,
  };
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
  const controller = new GameController(transport, opts, { dict: stubDict(), rng: () => 0.5 });
  await controller.init();
  return controller;
}

function playCats(controller: GameController) {
  controller.placeAt({ row: 7, col: 7 }, 0);
  controller.placeAt({ row: 7, col: 8 }, 1);
  controller.placeAt({ row: 7, col: 9 }, 2);
  controller.placeAt({ row: 7, col: 10 }, 3);
  controller.submitPlay();
}

describe('score sheet rows (controller)', () => {
  it('accumulates per-turn rows with running totals', async () => {
    const controller = await makeController();
    playCats(controller);
    controller.pass();
    controller.exchangeTiles([0, 1]);
    controller.resign(1);
    const sheet = controller.getSnapshot().sheet;
    expect(sheet).toHaveLength(4);
    expect(sheet[0]).toMatchObject({ by: 0, kind: 'play', word: 'CATS', score: 12, totals: [12, 0] });
    expect(sheet[1]).toMatchObject({ by: 1, kind: 'pass', score: 0, totals: [12, 0] });
    expect(sheet[2]).toMatchObject({ by: 0, kind: 'exchange', count: 2, totals: [12, 0] });
    expect(sheet[3]).toMatchObject({ by: 1, kind: 'resign' });
  });
});

describe('ScoreSheet drawer', () => {
  it('renders words, scores, running totals, and non-play turns', async () => {
    const controller = await makeController();
    playCats(controller);
    controller.pass();
    controller.exchangeTiles([0, 1]);
    render(
      <ScoreSheet
        open
        onClose={() => {}}
        rows={controller.getSnapshot().sheet}
        names={['Alice', 'Bob']}
      />,
    );
    const sheet = screen.getByTestId('score-sheet');
    expect(sheet.textContent).toContain('CATS');
    expect(sheet.textContent).toContain('+12');
    expect(sheet.textContent).toMatch(/pass/i);
    expect(sheet.textContent).toMatch(/exchanged 2/i);
    // Running totals line: 12 — 0 after the first play.
    expect(within(sheet).getAllByTestId('sheet-row')[0]?.textContent).toContain('12');
  });
});

describe('last-play highlight + animation hooks (T3.9)', () => {
  it('highlights the last play’s cells with staggered animate-in and floats its score', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    const highlighted = document.querySelectorAll('[data-last-play]');
    expect(highlighted).toHaveLength(4);
    const delays = [...highlighted].map((el) => (el as HTMLElement).style.animationDelay);
    expect(new Set(delays).size).toBe(4); // tile-by-tile stagger
    expect(screen.getByTestId('last-play-score').textContent).toContain('12');
  });

  it('the previous highlight clears when the next move lands', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    act(() => controller.pass());
    expect(document.querySelectorAll('[data-last-play]')).toHaveLength(0);
    expect(screen.queryByTestId('last-play-score')).toBeFalsy();
  });

  it('staging a tile hides the highlight (and floater); recall brings it back', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    // Next player starts placing: the opponent-play highlight must get out
    // of the way of the pending-placement emphasis.
    act(() => controller.placeAt({ row: 8, col: 7 }, 0));
    expect(document.querySelectorAll('[data-last-play]')).toHaveLength(0);
    expect(screen.queryByTestId('last-play-score')).toBeFalsy();
    act(() => controller.recallAll());
    expect(document.querySelectorAll('[data-last-play]')).toHaveLength(4);
    expect(screen.getByTestId('last-play-score')).toBeTruthy();
  });
});

describe('score bar + sheet access', () => {
  it('shows both scores and opens the score sheet', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    const bar = screen.getByTestId('score-bar');
    expect(bar.textContent).toContain('12');
    expect(bar.textContent).toContain('0');
    fireEvent.click(screen.getByRole('button', { name: /score sheet/i }));
    expect(screen.getByTestId('score-sheet')).toBeTruthy();
  });
});
