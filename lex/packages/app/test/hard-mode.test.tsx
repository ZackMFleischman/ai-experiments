// Hard mode end-to-end through the app layer (DESIGN §2.3): the preview
// withholds every dictionary verdict, Play stays live for any legal geometry,
// and committing a phoney spends the turn behind a beat that names the words.
//
// The negative assertions carry most of the weight here — the feature is
// defined by what the screen must NOT reveal, so each one pins a specific
// leak that would give the answer away early (a ✗, a red row, a ringed cell,
// a disabled Play button, a word in the shared score sheet).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RULESETS } from '@lex/engine';
import type { TileFace } from '@lex/engine';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import { GameBoard } from '../src/board/GameBoard';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { HotSeatGame } from '../src/game/HotSeatGame';

const classic = RULESETS['classic']!;
const P0_RACK: TileFace[] = ['C', 'A', 'T', 'S', 'E', 'R', 'N'];
const P1_RACK: TileFace[] = ['D', 'O', 'G', 'L', 'I', 'P', 'U'];

async function setup({ hardMode, rejects = [] }: { hardMode: boolean; rejects?: string[] }) {
  const opts: HotSeatOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    hardMode,
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

describe('hard mode: the preview withholds the verdict', () => {
  it('shows the word and its score but no ✓/✗ — even when the word is fine', async () => {
    const { controller } = await setup({ hardMode: true });
    stageCats(controller);
    const row = screen.getAllByTestId('preview-word')[0]!;
    expect(row.textContent).toContain('CATS');
    expect(row.textContent).toContain('12'); // scoring is never withheld
    expect(row.getAttribute('data-valid')).toBe('unknown');
    expect(row.textContent).not.toContain('✓');
    expect(row.textContent).not.toContain('✗');
    expect(screen.getByTestId('preview-withheld')).toBeTruthy();
  });

  it('looks IDENTICAL for a word the dictionary would reject', async () => {
    const { controller } = await setup({ hardMode: true, rejects: ['CATS'] });
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
    const { controller } = await setup({ hardMode: true, rejects: ['CATS'] });
    stageCats(controller);
    expect(controller.getSnapshot().preview?.playable).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' }).hasAttribute('disabled')).toBe(false);
  });

  it('still refuses illegal GEOMETRY — only the dictionary is relaxed', async () => {
    const { controller } = await setup({ hardMode: true });
    act(() => {
      controller.placeAt({ row: 7, col: 7 }, 0);
      controller.placeAt({ row: 7, col: 9 }, 2); // gap
    });
    expect(controller.getSnapshot().preview?.playable).toBe(false);
    expect(screen.getByTestId('preview-reason').textContent).toMatch(/gap/i);
  });

  it('the strict default is untouched: ✗, a blocked card, and Play off', async () => {
    const { controller } = await setup({ hardMode: false, rejects: ['CATS'] });
    stageCats(controller);
    const row = screen.getAllByTestId('preview-word')[0]!;
    expect(row.getAttribute('data-valid')).toBe('false');
    expect(screen.getByTestId('preview-card').getAttribute('data-blocked')).toBe('true');
    expect(controller.getSnapshot().preview?.playable).toBe(false);
    expect(screen.queryByTestId('preview-withheld')).toBeNull();
  });
});

describe('hard mode: committing a phoney costs the turn', () => {
  it('raises the beat naming the refused word, and spends the turn', async () => {
    const { controller } = await setup({ hardMode: true, rejects: ['CATS'] });
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
    const { controller } = await setup({ hardMode: true, rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());
    fireEvent.click(screen.getByTestId('phoney-dismiss'));
    expect(screen.queryByTestId('phoney-beat')).toBeNull();
    expect(controller.getSnapshot().phoney).toBeUndefined();
  });

  it('records the lost turn in the score sheet WITHOUT the word (privacy)', async () => {
    const { controller } = await setup({ hardMode: true, rejects: ['CATS'] });
    stageCats(controller);
    act(() => controller.submitPlay());

    const [row] = controller.getSnapshot().sheet;
    expect(row?.kind).toBe('phoney');
    expect(row?.score).toBe(0);
    expect(row?.word).toBeNull();
    expect(row?.words).toEqual([]);
    // The sheet is the one surface BOTH players read: it must not carry the
    // attempted letters, which are still in the mover's rack.
    expect(JSON.stringify(controller.getSnapshot().sheet)).not.toContain('CATS');
  });

  it('a good play in hard mode scores and raises no beat', async () => {
    const { controller } = await setup({ hardMode: true });
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
describe('hard mode in hot-seat: the beat never opens the rack', () => {
  async function hotSeat() {
    const opts: HotSeatOptions = {
      rulesetId: 'classic',
      dictionaryId: 'stub',
      hardMode: true,
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
