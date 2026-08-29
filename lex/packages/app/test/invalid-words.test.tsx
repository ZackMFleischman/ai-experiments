// The `invalidWords: 'costs-turn'` setting end-to-end through the app layer
// (DESIGN §2.3): the preview withholds every dictionary verdict, Play stays
// live for any legal geometry, and committing a phoney spends the turn behind
// a beat that names the words.
//
// The negative assertions carry most of the weight here — the feature is
// defined by what the screen must NOT reveal, so each one pins a specific
// leak that would give the answer away early (a ✗, a red row, a ringed cell,
// a disabled Play button, a word in the shared score sheet).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RULESETS } from '@lex/engine';
import type { InvalidWordRule, TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import { GameBoard } from '../src/board/GameBoard';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { invalidWordList } from '../src/gameOptions';
import { HotSeatGame } from '../src/game/HotSeatGame';

const classic = RULESETS['classic']!;
const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

async function setup({
  invalidWords,
  rejects = [],
}: {
  invalidWords: InvalidWordRule;
  rejects?: string[];
}) {
  const opts: HotSeatOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    invalidWords,
    bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
    seats: 2,
  };
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
  const controller = new GameController(transport, opts, {
    dict: stubDict(rejects),
    rng: () => 0.5,
  });
  await controller.init();
  const utils = render(<GameBoard controller={controller} />);
  return { controller, ...utils };
}

/** CATS across the star — a legal first play whichever dictionary is loaded. */
function stageCats(controller: GameController) {
  act(() => {
    controller.placeAt({ row: 7, col: 7 }, 0);
    controller.placeAt({ row: 7, col: 8 }, 1);
    controller.placeAt({ row: 7, col: 9 }, 2);
    controller.placeAt({ row: 7, col: 10 }, 3);
  });
}

describe("invalidWords 'costs-turn': the preview withholds the verdict", () => {
  it('shows the word and its score but no ✓/✗ — even when the word is fine', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn' });
    stageCats(controller);
    const row = screen.getAllByTestId('preview-word')[0]!;
    expect(row.textContent).toContain('CATS');
    expect(row.textContent).toContain('12'); // scoring is never withheld
    expect(row.getAttribute('data-valid')).toBe('unknown');
    // The verdict column is ABSENT, not blanked: no tick, no cross, and no
    // placeholder standing in for one. The row is word + score, nothing else.
    expect(row.textContent).not.toContain('✓');
    expect(row.textContent).not.toContain('✗');
    expect(row.textContent).not.toContain('—');
    // Concatenated with no separator: the row is exactly two spans, the word
    // and the score. Anything else in here is a mark that shouldn't be drawn.
    expect(row.textContent).toBe('CATS12');
    // The card doesn't narrate the omission either.
    expect(screen.getByTestId('preview-card').textContent).not.toMatch(/not checked/i);
  });

  it('looks IDENTICAL for a word the dictionary would reject', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    const card = screen.getByTestId('preview-card');
    const row = screen.getAllByTestId('preview-word')[0]!;
    // The three tells the strict card uses to condemn a word, all absent.
    expect(row.getAttribute('data-valid')).toBe('unknown');
    expect(card.getAttribute('data-blocked')).toBeNull();
    expect(screen.queryByTestId('play-blocked-reason')).toBeNull();
    // …and the total is not struck through: it still reads as points on offer.
    expect(screen.getByTestId('preview-total').textContent).toBe('+12');
  });

  it('leaves Play enabled on a phoney — committing is the gamble', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    expect(controller.getSnapshot().preview?.playable).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' }).hasAttribute('disabled')).toBe(false);
  });

  it('still refuses illegal GEOMETRY — only the dictionary verdict changes', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn' });
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 9 }, 2); // gap
    });
    expect(controller.getSnapshot().preview?.playable).toBe(false);
    expect(screen.getByTestId('preview-reason').textContent).toMatch(/gap/i);
  });

  it("the 'blocked' default is untouched: ✗, a blocked card, and Play off", async () => {
    const { controller } = await setup({ invalidWords: 'blocked', rejects: ['CATS'] });
    stageCats(controller);
    const row = screen.getAllByTestId('preview-word')[0]!;
    expect(row.getAttribute('data-valid')).toBe('false');
    expect(screen.getByTestId('preview-card').getAttribute('data-blocked')).toBe('true');
    expect(controller.getSnapshot().preview?.playable).toBe(false);
    expect(row.textContent).toContain('✗');
  });
});

describe("invalidWords 'costs-turn': committing a phoney costs the turn", () => {
  it('raises the beat naming the refused word, and spends the turn', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());

    expect(screen.getByTestId('phoney-beat')).toBeTruthy();
    expect(screen.getByTestId('phoney-word').textContent).toBe('CATS');

    const snap = controller.getSnapshot();
    expect(snap.state.board.size).toBe(0); // nothing was placed
    expect(snap.scores).toEqual([0, 0]);
    expect(snap.toMove).toBe(1); // …but the turn is gone
    expect(snap.state.scorelessRun).toBe(1);
    // The tiles are back in hand, not lost with the turn.
    expect(snap.rack.filter((f) => f !== null)).toHaveLength(classic.rackSize);
  });

  it('the beat is dismissible and does not come back', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());
    fireEvent.click(screen.getByTestId('phoney-dismiss'));
    expect(screen.queryByTestId('phoney-beat')).toBeNull();
    expect(controller.getSnapshot().phoney).toBeUndefined();
  });

  it('records the lost turn in the score sheet, naming the word tried', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());

    const [row] = controller.getSnapshot().sheet;
    expect(row?.kind).toBe('phoney');
    expect(row?.score).toBe(0);
    // The words a refused play FORMED are public (§3.3) — scored 0, with no
    // cells, because nothing reached the board.
    expect(row?.word).toBe('CATS');
    expect(row?.words).toEqual([{ word: 'CATS', score: 0, cells: [] }]);
  });
});

// A phoney changes nothing on the board, so without these two surfaces the
// player who arrives next cannot tell it from a pass.
describe('a phoney is legible to the OPPONENT', () => {
  it('leaves a banner naming the player, the word tried, and the cost', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());
    fireEvent.click(screen.getByTestId('phoney-dismiss'));

    const banner = screen.getByTestId('phoney-banner');
    expect(banner.textContent).toBe(
      'Player 1 tried to play the invalid word “CATS” — turn lost',
    );
  });

  it('phrases one word and several the same way the push does', () => {
    // Pinned literally against the server's phoneyCopy (functions/notify test)
    // — the two packages cannot share code, so they share a spelling instead.
    expect(invalidWordList(['QUIZZ'])).toBe('the invalid word “QUIZZ”');
    expect(invalidWordList(['QUIZZ', 'ZA'])).toBe('the invalid words “QUIZZ” and “ZA”');
    expect(invalidWordList(['A', 'B', 'C'])).toBe('the invalid words “A”, “B” and “C”');
  });

  it('the banner yields once the next player starts staging', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());
    fireEvent.click(screen.getByTestId('phoney-dismiss'));
    expect(screen.getByTestId('phoney-banner')).toBeTruthy();

    act(() => controller.placeAt({ row: 7, col: 7 }, 0));
    expect(screen.queryByTestId('phoney-banner')).toBeNull();
    act(() => controller.recallAll());
    expect(screen.getByTestId('phoney-banner')).toBeTruthy();
  });

  it('no banner after an ordinary play', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn' });
    stageCats(controller);
    act(() => controller.submitPlay());
    expect(screen.queryByTestId('phoney-banner')).toBeNull();
  });

  it('marks the turn in the score sheet: ✗, red, and a zero', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn', rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());
    fireEvent.click(screen.getByTestId('phoney-dismiss'));
    fireEvent.click(screen.getByTestId('phoney-banner'));

    // T7.14 made the sheet columnar — a `sheet-row` is now a ROUND across every
    // seat and the move lives in a `sheet-cell`, which is what carries the kind.
    // Same four assertions, one level down.
    const cell = screen
      .getAllByTestId('sheet-cell')
      .find((c) => c.getAttribute('data-kind') === 'phoney');
    expect(cell).toBeTruthy();
    expect(within(cell!).getByTestId('sheet-phoney-mark')).toBeTruthy();
    expect(cell!.textContent).toContain('Tried the invalid word “CATS”');
    expect(cell!.textContent).toContain('0');
  });

  it('a good play scores normally and raises no beat', async () => {
    const { controller } = await setup({ invalidWords: 'costs-turn' });
    stageCats(controller);
    act(() => controller.submitPlay());
    expect(screen.queryByTestId('phoney-beat')).toBeNull();
    const snap = controller.getSnapshot();
    expect(snap.scores[0]).toBe(12);
    expect(snap.sheet[0]?.kind).toBe('play');
  });
});


// The beat is the one thing that appears while the device is mid-handoff, so
// it is also the one thing that could pry the privacy screen open (§7.3).
describe('the phoney beat in hot-seat never opens the rack', () => {
  async function hotSeat() {
    const opts: HotSeatOptions = {
      rulesetId: 'classic',
      dictionaryId: 'stub',
      invalidWords: 'costs-turn',
      bagOrder: riggedBagOrder(classic, [P0_RACK, P1_RACK]),
      seats: 2,
    };
    const transport = new LocalTransport<HotSeatOptions, LexEntry>(opts);
    const controller = new GameController(transport, opts, {
      dict: stubDict(['CATS']),
      rng: () => 0.5,
    });
    await controller.init();
    render(
      <MemoryRouter>
        <HotSeatGame controller={controller} />
      </MemoryRouter>,
    );
    // Reveal seat 0's rack (the interstitial is up from first load).
    fireEvent.click(screen.getByTestId('pass-device'));
    return controller;
  }

  it('keeps the pass-device screen up behind the beat', async () => {
    const controller = await hotSeat();
    stageCats(controller);
    act(() => controller.submitPlay());

    // Both are on screen: the beat tells seat 0 what happened, the interstitial
    // underneath it goes on hiding seat 1's rack.
    expect(screen.getByTestId('phoney-beat')).toBeTruthy();
    expect(screen.getByTestId('pass-device')).toBeTruthy();

    // Dismissing the beat must not reveal anything — the handoff still stands.
    fireEvent.click(screen.getByTestId('phoney-dismiss'));
    expect(screen.queryByTestId('phoney-beat')).toBeNull();
    expect(screen.getByTestId('pass-device')).toBeTruthy();
  });
});
