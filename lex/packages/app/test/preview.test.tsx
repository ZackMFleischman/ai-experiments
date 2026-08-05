// T3.7 gate: the live preview card — ONE panel for the whole staged play
// (every word with its own score, the bingo line, the total) instead of a chip
// per word. The card is placed off the play (previewCard, covered by
// preview-card.test.ts) and the player can drag it anywhere.
// (Play enablement rules are covered in controller.test.ts / actions.test.tsx.)
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

async function setup(dict = stubDict(), p0: TileFace[] = P0_RACK) {
  const opts: HotSeatOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, [p0, P1_RACK]),
    seats: 2,
  };
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
  const controller = new GameController(transport, opts, { dict, rng: () => 0.5 });
  await controller.init();
  const utils = render(<GameBoard controller={controller} />);
  return { controller, ...utils };
}

function stageCats(controller: GameController) {
  act(() => {
    controller.placeAt({ row: 7, col: 7 }, 0);
    controller.placeAt({ row: 7, col: 8 }, 1);
    controller.placeAt({ row: 7, col: 9 }, 2);
    controller.placeAt({ row: 7, col: 10 }, 3);
  });
}

const words = () => screen.queryAllByTestId('preview-word');

describe('preview card (T3.7)', () => {
  it('a valid play shows one card: the word with its score, ✓, and the total', async () => {
    const { controller } = await setup();
    stageCats(controller);
    expect(screen.getAllByTestId('preview-card')).toHaveLength(1);
    const rows = words();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('data-valid')).toBe('true');
    expect(rows[0]?.textContent).toContain('CATS');
    expect(rows[0]?.textContent).toContain('12');
    expect(rows[0]?.textContent).toContain('✓');
    expect(screen.getByTestId('preview-total').textContent).toBe('+12');
  });

  it('an invalid word flags ✗ on its row', async () => {
    const { controller } = await setup(stubDict(['CATS']));
    stageCats(controller);
    const row = screen.getByTestId('preview-word');
    expect(row.getAttribute('data-valid')).toBe('false');
    expect(row.textContent).toContain('✗');
  });

  it('illegal geometry shows the reason in the card instead of words', async () => {
    const { controller } = await setup();
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 9 }, 2); // gap at 7,8
    });
    expect(words()).toHaveLength(0);
    expect(screen.queryByTestId('preview-total')).toBeFalsy();
    const card = screen.getByTestId('preview-card');
    expect(within(card).getByTestId('preview-reason').textContent).toMatch(/gap/i);
  });

  it('cross words are stacked rows of ONE card, under one total', async () => {
    const { controller } = await setup();
    stageCats(controller);
    act(() => controller.submitPlay());
    // p1 lays DO under CA: main word DO + cross words CD and AO.
    act(() => {
      controller.placeAt({ row: 8, col: 7 }, 0);
      controller.placeAt({ row: 8, col: 8 }, 1);
    });
    expect(screen.getAllByTestId('preview-card')).toHaveLength(1);
    const rows = words();
    expect(rows).toHaveLength(3);
    const text = rows.map((r) => r.textContent).join(' ');
    expect(text).toMatch(/DO/);
    const preview = controller.getSnapshot().preview!;
    for (const w of preview.words) expect(text).toContain(`${w.word}${w.score}`);
    expect(screen.getByTestId('preview-total').textContent).toBe(`+${preview.total}`);
  });

  it('a bingo gets its own line, and the total carries the bonus', async () => {
    const { controller } = await setup();
    act(() => {
      for (let i = 0; i < 7; i++) controller.placeAt({ row: 7, col: 7 + i }, i);
    });
    const preview = controller.getSnapshot().preview!;
    expect(preview.bingo).toBe(true);
    expect(screen.getByTestId('preview-bingo').textContent).toContain(`+${classic.bingoBonus}`);
    const wordSum = preview.words.reduce((n, w) => n + w.score, 0);
    expect(screen.getByTestId('preview-total').textContent).toBe(`+${wordSum + classic.bingoBonus}`);
  });

  it('no card while a blank awaits its letter (the picker is up)', async () => {
    const { controller } = await setup(stubDict(), ['C', 'A', 'T', '?', 'E', 'R', 'N']);
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 8 }, 3); // undesignated blank
    });
    expect(screen.queryByTestId('preview-card')).toBeFalsy();
  });

  it('the player can drag the card by its grip, and it stays parked', async () => {
    const { controller } = await setup();
    stageCats(controller);
    const card = screen.getByTestId('preview-card');
    expect(card.getAttribute('data-manual')).toBeNull();
    const before = { left: card.style.left, top: card.style.top };

    const grip = screen.getByTestId('preview-grip');
    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 100, clientY: 100, isPrimary: true });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 220, clientY: 300 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 220, clientY: 300 });

    const moved = screen.getByTestId('preview-card');
    expect(moved.getAttribute('data-manual')).toBe('true');
    expect({ left: moved.style.left, top: moved.style.top }).not.toEqual(before);
    const parked = { left: moved.style.left, top: moved.style.top };

    // Staging another tile keeps the parked spot (it does not cover the word).
    act(() => controller.placeAt({ row: 7, col: 11 }, 4));
    const after = screen.getByTestId('preview-card');
    expect({ left: after.style.left, top: after.style.top }).toEqual(parked);
  });

  // The card parks in the empty space beside the play — exactly where the next
  // tile goes — so a tap must reach the cell UNDER it. Only the grip is live.
  it('is click-through except for its grip', async () => {
    const { controller } = await setup();
    stageCats(controller);
    expect(getComputedStyle(screen.getByTestId('preview-card')).pointerEvents).toBe('none');
    expect(getComputedStyle(screen.getByTestId('preview-grip')).pointerEvents).toBe('auto');
  });

  it('a transient geometry hint carries no grip at all', async () => {
    const { controller } = await setup();
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 9 }, 2); // gap at 7,8
    });
    expect(screen.getByTestId('preview-card')).toBeTruthy();
    expect(screen.queryByTestId('preview-grip')).toBeFalsy();
  });

  it('rings the cells of a word that failed the dictionary', async () => {
    const { controller } = await setup(stubDict(['CATS']));
    const flagged = () =>
      [...document.querySelectorAll('[data-flagged="true"]')].map((el) => el.getAttribute('data-cell'));
    expect(flagged()).toEqual([]);
    stageCats(controller);
    expect(flagged()).toEqual(['7,7', '7,8', '7,9', '7,10']);
  });

  it('rings nothing while every word is valid', async () => {
    const { controller } = await setup();
    stageCats(controller);
    expect(document.querySelectorAll('[data-flagged="true"]')).toHaveLength(0);
  });
});
