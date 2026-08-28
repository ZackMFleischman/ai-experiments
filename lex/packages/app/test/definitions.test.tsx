// T8.2 gate: word definitions. Tap a word where it already is — a row of the
// live preview card, or a word in the score sheet — and one shared sheet
// answers. The load-bearing behaviours: a missing definition never reads as
// "invalid word", a gloss found through a reduced form says so, and the
// Wiktionary link-out is offered in every state.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RULESETS } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import { GameBoard } from '../src/board/GameBoard';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { WordDefinitionSheet } from '../src/game/WordDefinitionSheet';

const { lookupGloss } = vi.hoisted(() => ({ lookupGloss: vi.fn() }));
vi.mock('@lex/dict', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lex/dict')>()),
  lookupGloss,
}));

const classic = RULESETS['classic']!;
const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

beforeEach(() => {
  lookupGloss.mockReset();
});

async function setup(dict = stubDict()) {
  const opts: HotSeatOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
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

describe('WordDefinitionSheet', () => {
  it('shows the word, its part of speech, and the definition', async () => {
    lookupGloss.mockResolvedValue({ word: 'QI', pos: 'n', gloss: 'the vital life force' });
    render(<WordDefinitionSheet word="qi" onClose={() => {}} />);

    expect((await screen.findByTestId('definition-gloss')).textContent).toBe('the vital life force');
    expect(screen.getByTestId('word-definition').getAttribute('data-word')).toBe('QI');
    expect(screen.getByText('noun')).toBeTruthy();
  });

  it('names the word a gloss was actually found under', async () => {
    lookupGloss.mockResolvedValue({
      word: 'CATS',
      pos: 'n',
      gloss: 'a small domesticated feline',
      base: 'CAT',
    });
    render(<WordDefinitionSheet word="CATS" onClose={() => {}} />);

    expect((await screen.findByTestId('definition-base')).textContent).toContain('form of CAT');
  });

  it('says an undefined word is still legal, never that it is not a word', async () => {
    lookupGloss.mockResolvedValue(null);
    render(<WordDefinitionSheet word="ZYZZYVA" onClose={() => {}} />);

    const none = await screen.findByTestId('definition-none');
    expect(none.textContent).toMatch(/still a legal word/i);
    expect(screen.queryByTestId('definition-gloss')).toBeFalsy();
  });

  it('does not call a word the dictionary rejected "legal"', async () => {
    lookupGloss.mockResolvedValue(null);
    render(<WordDefinitionSheet word="ENT" legal={false} onClose={() => {}} />);

    const none = await screen.findByTestId('definition-none');
    expect(none.textContent).not.toMatch(/still a legal word/i);
    expect(none.textContent).toMatch(/doesn.t accept it/i);
  });

  it('distinguishes a glossary that will not load from a word it does not know', async () => {
    lookupGloss.mockRejectedValue(new Error('offline'));
    render(<WordDefinitionSheet word="QI" onClose={() => {}} />);

    expect((await screen.findByTestId('definition-error')).textContent).toMatch(/offline/i);
    expect(screen.queryByTestId('definition-none')).toBeFalsy();
  });

  it('offers the Wiktionary link-out whatever the lookup returned', async () => {
    for (const outcome of [
      { word: 'QI', pos: 'n', gloss: 'the vital life force' },
      null,
    ]) {
      lookupGloss.mockResolvedValue(outcome);
      const { unmount } = render(<WordDefinitionSheet word="QI" onClose={() => {}} />);
      const link = await screen.findByTestId('definition-wiktionary');
      expect(link.getAttribute('href')).toBe('https://en.wiktionary.org/wiki/qi');
      expect(link.getAttribute('rel')).toContain('noopener');
      unmount();
    }
  });

  it('stays shut with no word to define, and looks nothing up', () => {
    render(<WordDefinitionSheet word={null} onClose={() => {}} />);
    expect(screen.queryByTestId('word-definition')).toBeFalsy();
    expect(lookupGloss).not.toHaveBeenCalled();
  });
});

describe('definition from a staged word (preview card)', () => {
  it('opens the sheet for the word the row names', async () => {
    lookupGloss.mockResolvedValue({ word: 'CATS', pos: 'n', gloss: 'more than one cat' });
    const { controller } = await setup();
    stageCats(controller);

    fireEvent.click(screen.getByTestId('preview-word'));

    expect((await screen.findByTestId('definition-gloss')).textContent).toBe('more than one cat');
    expect(lookupGloss).toHaveBeenCalledWith('CATS');
  });

  // The card parks in the empty space beside the play — exactly where the next
  // tile goes — so it is click-through by design (PreviewCard). A word row opts
  // back in only under the grip's own rule: not while a tile is in flight or
  // armed for placement, and never at the cost of the viewport's pan gesture.
  it('does not let the tap reach the viewport that pans the board', async () => {
    lookupGloss.mockResolvedValue(null);
    const { controller } = await setup();
    stageCats(controller);

    // React dispatches from the root, so a synthetic stopPropagation() lands on
    // the native event — which is exactly what keeps the viewport (and its
    // pointer capture) out of a tap meant for the word.
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const stopped = vi.spyOn(event, 'stopPropagation');
    screen.getByTestId('preview-word').dispatchEvent(event);

    expect(stopped).toHaveBeenCalled();
  });

  it('stops taking taps while a rack tile is armed, so the board still gets them', async () => {
    lookupGloss.mockResolvedValue(null);
    const { controller } = await setup();
    stageCats(controller);
    act(() => controller.selectRackSlot(4)); // arm a tile for tap-tap placement

    const row = screen.getByTestId('preview-word');
    expect(getComputedStyle(row).pointerEvents).toBe('none');
  });

  it('defines an invalid word too — that is when a player most wants to know', async () => {
    lookupGloss.mockResolvedValue(null);
    const { controller } = await setup(stubDict(['ER']));
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 4); // E
      controller.placeAt({ row: 7, col: 8 }, 5); // R — rejected by this dict
    });

    const row = screen.getByTestId('preview-word');
    expect(row.getAttribute('data-valid')).toBe('false');
    fireEvent.click(row);

    // …and the chip's verdict reaches the sheet, so the empty state doesn't
    // reassure the player that a rejected word is legal.
    const none = await screen.findByTestId('definition-none');
    expect(none.textContent).toMatch(/doesn.t accept it/i);
  });
});

describe('definition from a locked-in word (score sheet)', () => {
  it('opens the sheet for a word played earlier in the game', async () => {
    lookupGloss.mockResolvedValue({ word: 'CATS', pos: 'n', gloss: 'more than one cat' });
    const { controller } = await setup();
    stageCats(controller);
    act(() => {
      controller.submitPlay();
    });

    fireEvent.click(screen.getByLabelText('score sheet'));
    fireEvent.click(await screen.findByRole('button', { name: 'Define CATS' }));

    await waitFor(() => expect(screen.getByTestId('definition-gloss')).toBeTruthy());
    expect(lookupGloss).toHaveBeenCalledWith('CATS');
  });

  it('treats a locked-in word as legal — the dictionary already accepted it', async () => {
    lookupGloss.mockResolvedValue(null);
    const { controller } = await setup();
    stageCats(controller);
    act(() => {
      controller.submitPlay();
    });

    fireEvent.click(screen.getByLabelText('score sheet'));
    fireEvent.click(await screen.findByRole('button', { name: 'Define CATS' }));

    const none = await screen.findByTestId('definition-none');
    expect(none.textContent).toMatch(/still a legal word/i);
  });

  it('leaves turns with no words — a pass — as plain text', async () => {
    const { controller } = await setup();
    act(() => controller.pass());

    fireEvent.click(screen.getByLabelText('score sheet'));
    expect(await screen.findByText('Pass')).toBeTruthy();
    expect(screen.queryAllByTestId('sheet-word')).toHaveLength(0);
  });
});
