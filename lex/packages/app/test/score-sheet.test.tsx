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
import type { SheetRow } from '../src/controller/GameController';
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

/** A motionless press on the board background — the viewport's "tap" (taps
 * >12px apart so two in a row can't read as the double-tap zoom). */
function tapBoard(x: number, y: number) {
  const viewport = screen.getByTestId('board-viewport');
  fireEvent.pointerDown(viewport, { pointerId: 1, clientX: x, clientY: y, isPrimary: true });
  fireEvent.pointerUp(viewport, { pointerId: 1, clientX: x, clientY: y });
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

// T7.14: at four seats the flat list — one line per turn, four running totals
// joined by dashes — was unreadable. The sheet is a column per player.
describe('the columnar sheet (T7.14)', () => {
  /** A hand-built sheet: rows in play order, running totals accumulated the
   * way the controller records them. */
  function rows(seats: number, moves: ReadonlyArray<Partial<SheetRow> & { by: number }>): SheetRow[] {
    const totals = Array.from({ length: seats }, () => 0);
    return moves.map((move, n) => {
      totals[move.by] = (totals[move.by] ?? 0) + (move.score ?? 0);
      return {
        n,
        kind: 'play',
        word: null,
        words: [],
        score: 0,
        cells: [],
        ...move,
        by: move.by,
        totals: [...totals],
      } as SheetRow;
    });
  }

  const FOUR = rows(4, [
    { by: 0, word: 'CATS', words: [{ word: 'CATS', score: 12, cells: [] }], score: 12 },
    { by: 1, kind: 'pass' },
    { by: 2, word: 'MINA', words: [{ word: 'MINA', score: 9, cells: [] }], score: 9 },
    { by: 3, kind: 'exchange', count: 3 },
    { by: 0, word: 'RATS', words: [{ word: 'RATS', score: 14, cells: [] }], score: 14 },
    { by: 1, kind: 'resign' },
  ]);

  it('gives every seat a column and every round a row', () => {
    render(<ScoreSheet open onClose={() => {}} rows={FOUR} names={['Ada', 'Sam', 'Noor', 'Kai']} />);
    const sheet = screen.getByTestId('score-sheet');
    expect(within(sheet).getAllByTestId('sheet-column-head').map((el) => el.textContent)).toEqual([
      'Ada',
      'Sam',
      'Noor',
      'Kai',
    ]);
    // Two turns each at most → two rounds, each with a cell per seat.
    const roundRows = within(sheet).getAllByTestId('sheet-row');
    expect(roundRows).toHaveLength(2);
    expect(within(roundRows[0]!).getAllByTestId('sheet-cell')).toHaveLength(4);
    expect(roundRows[0]!.textContent).toContain('CATS');
    expect(roundRows[0]!.textContent).toContain('MINA');
    expect(roundRows[1]!.textContent).toContain('RATS');
  });

  it('foots each column with that player’s running total', () => {
    render(<ScoreSheet open onClose={() => {}} rows={FOUR} names={['Ada', 'Sam', 'Noor', 'Kai']} />);
    expect(
      within(screen.getByTestId('score-sheet'))
        .getAllByTestId('sheet-total')
        .map((el) => el.textContent),
    ).toEqual(['26', '0', '9', '0']);
  });

  it('calls a 3+ resign a withdrawal, and keeps the two-seat word', () => {
    const { unmount } = render(
      <ScoreSheet open onClose={() => {}} rows={FOUR} names={['Ada', 'Sam', 'Noor', 'Kai']} />,
    );
    expect(screen.getByTestId('score-sheet').textContent).toContain('Withdrew');
    unmount();
    render(
      <ScoreSheet
        open
        onClose={() => {}}
        rows={rows(2, [{ by: 0, kind: 'pass' }, { by: 1, kind: 'resign' }])}
        names={['Alice', 'Bob']}
      />,
    );
    expect(screen.getByTestId('score-sheet').textContent).toContain('Resigned');
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

  // The badge sits in an empty cell beside the word, which can still be the
  // square you want to look at — and staging a tile used to be its only exit.
  it('a board tap tucks the score away; another tap brings it back', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    expect(screen.getByTestId('last-play-score')).toBeTruthy();

    tapBoard(30, 30);
    expect(screen.queryByTestId('last-play-score')).toBeFalsy();
    // Only the number steps aside: the play itself stays highlighted.
    expect(document.querySelectorAll('[data-last-play]')).toHaveLength(4);

    tapBoard(300, 200);
    expect(screen.getByTestId('last-play-score')).toBeTruthy();
  });

  it('taps taken while tiles are staged leave the score alone for the recall', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    act(() => controller.placeAt({ row: 8, col: 7 }, 0));
    expect(screen.queryByTestId('last-play-score')).toBeFalsy();

    tapBoard(30, 30);
    tapBoard(300, 200);
    act(() => controller.recallAll());
    expect(screen.getByTestId('last-play-score')).toBeTruthy();
  });

  it('the next play brings the score back however the last one was left', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    tapBoard(30, 30);
    expect(screen.queryByTestId('last-play-score')).toBeFalsy();

    act(() => {
      controller.placeAt({ row: 8, col: 7 }, 0);
      controller.placeAt({ row: 9, col: 7 }, 1);
      controller.submitPlay();
    });
    expect(screen.getByTestId('last-play-score')).toBeTruthy();
  });

  it('tapping the score expands the words that made it', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    expect(screen.queryByTestId('last-play-breakdown')).toBeFalsy();

    fireEvent.click(screen.getByTestId('last-play-score'));
    const panel = screen.getByTestId('last-play-breakdown');
    const rows = within(panel).getAllByTestId('breakdown-word');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('CATS');
    expect(rows[0]?.textContent).toContain('12');
    expect(within(panel).getByTestId('breakdown-total').textContent).toBe('+12');
  });

  it('a bonus the words do not account for gets its own line', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => {
      for (let i = 0; i < 7; i++) controller.placeAt({ row: 7, col: 7 + i }, i);
      controller.submitPlay();
    });
    fireEvent.click(screen.getByTestId('last-play-score'));
    const panel = screen.getByTestId('last-play-breakdown');
    const words = within(panel).getAllByTestId('breakdown-word');
    const sum = words.length;
    expect(sum).toBeGreaterThan(0);
    expect(within(panel).getByTestId('breakdown-bonus').textContent).toContain(
      `${classic.bingoBonus}`,
    );
  });

  // The badge sits in an empty cell — the cell you may be about to tap into.
  it('goes inert the moment a rack tile is armed for tap-tap placement', async () => {
    const controller = await makeController();
    render(<GameBoard controller={controller} />);
    act(() => playCats(controller));
    const badge = screen.getByTestId('last-play-score');
    expect(getComputedStyle(badge).pointerEvents).toBe('auto');
    act(() => controller.selectRackSlot(0));
    expect(getComputedStyle(screen.getByTestId('last-play-score')).pointerEvents).toBe('none');
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
