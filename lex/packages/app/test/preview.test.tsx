// T3.7 gate: live preview — per-word chips (word, points, ✓/✗ from the local
// dict) and the geometry-reason chip. The chips carry the scores; there is no
// separate total badge (it duplicated the chip and obscured the board).
// (Play enablement rules are covered in controller.test.ts / actions.test.tsx.)
import { act, render, screen } from '@testing-library/react';
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

describe('preview chips (T3.7)', () => {
  it('a valid play shows a ✓ chip with word + points and no separate total badge', async () => {
    const { controller } = await setup();
    stageCats(controller);
    const chips = screen.getAllByTestId('preview-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.getAttribute('data-valid')).toBe('true');
    expect(chips[0]?.textContent).toContain('CATS');
    expect(chips[0]?.textContent).toContain('12');
    expect(chips[0]?.textContent).toContain('✓');
    expect(screen.queryByTestId('preview-total')).toBeFalsy();
  });

  it('an invalid word flags ✗ on its chip', async () => {
    const { controller } = await setup(stubDict(['CATS']));
    stageCats(controller);
    const chip = screen.getByTestId('preview-chip');
    expect(chip.getAttribute('data-valid')).toBe('false');
    expect(chip.textContent).toContain('✗');
  });

  it('illegal geometry shows the reason instead of word chips', async () => {
    const { controller } = await setup();
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 9 }, 2); // gap at 7,8
    });
    expect(screen.queryAllByTestId('preview-chip')).toHaveLength(0);
    expect(screen.queryByTestId('preview-total')).toBeFalsy();
    const reason = screen.getByTestId('preview-reason');
    expect(reason.textContent).toMatch(/gap/i);
  });

  it('cross words each get a chip carrying its own score', async () => {
    const { controller } = await setup();
    stageCats(controller);
    act(() => controller.submitPlay());
    // p1 lays DO under CA: main word DO + cross words CD and AO.
    act(() => {
      controller.placeAt({ row: 8, col: 7 }, 0);
      controller.placeAt({ row: 8, col: 8 }, 1);
    });
    const chips = screen.getAllByTestId('preview-chip');
    expect(chips.map((c) => c.textContent).join(' ')).toMatch(/DO/);
    expect(chips).toHaveLength(3);
    for (const w of controller.getSnapshot().preview!.words) {
      expect(chips.map((c) => c.textContent).join(' ')).toContain(`${w.word} ${w.score}`);
    }
    expect(screen.queryByTestId('preview-total')).toBeFalsy();
  });

  it('no chips while a blank awaits its letter (the picker is up)', async () => {
    const { controller } = await setup(stubDict(), ['C', 'A', 'T', '?', 'E', 'R', 'N']);
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 8 }, 3); // undesignated blank
    });
    expect(screen.queryAllByTestId('preview-chip')).toHaveLength(0);
  });
});
