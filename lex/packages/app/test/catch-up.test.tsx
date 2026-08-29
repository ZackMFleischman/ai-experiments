// T7.14 gate: the catch-up player. At three and four seats several turns
// happen between yours, so the controller keeps a review cursor over the moves
// you missed, the board rewinds to the position as of the reviewed move (using
// the placement cells now recorded on every SheetRow), and CatchUpBar steps
// through them without ever taking your turn away.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RULESETS, initialState, serializeState } from '@lex/engine';
import type { Cell, CellKey, TileFace } from '@lex/engine';
import { LocalTransport, type GameTransport } from '@parlor/core';
import { describe, expect, it } from 'vitest';
import { riggedBagOrder, stubDict } from '../../engine/test/helpers';
import { GameBoard } from '../src/board/GameBoard';
import type { GameOptions, LexEntry, SyncRow } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { CatchUpBar, describeMove } from '../src/game/CatchUpBar';

const classic = RULESETS['classic']!;
const NAMES = ['Ada', 'Sam', 'Noor', 'Kai'];
const RACKS: TileFace[][] = [
  ['C', 'A', 'T', 'S', 'E', 'R', 'N'],
  ['D', 'O', 'G', 'L', 'I', 'P', 'U'],
  ['M', 'I', 'N', 'E', 'R', 'A', 'L'],
  ['B', 'O', 'X', 'E', 'S', 'T', 'Y'],
];

async function table(seats = 4): Promise<GameController> {
  const options: GameOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, RACKS.slice(0, seats), [
      'R', 'A', 'T', 'E', 'S', 'O', 'N', 'I', 'T', 'E', 'A', 'D',
    ]),
    seats,
  };
  const transport = new LocalTransport<GameOptions, LexEntry>(options);
  const controller = new GameController(transport, options, { dict: stubDict(), rng: () => 0.5 });
  await controller.init();
  return controller;
}

/** Lay `letters` (wherever they sit in the acting rack) and commit the turn. */
function playWord(c: GameController, letters: string, cells: readonly Cell[]): void {
  [...letters].forEach((letter, i) => {
    const slot = c.getSnapshot().rack.indexOf(letter as TileFace);
    expect(slot).toBeGreaterThanOrEqual(0);
    c.placeAt(cells[i]!, slot);
  });
  c.submitPlay();
}

const across = (row: number, cols: readonly number[]): Cell[] => cols.map((col) => ({ row, col }));
const down = (col: number, rows: readonly number[]): Cell[] => rows.map((row) => ({ row, col }));

/** Ada opens with CATS; then three turns go by before it is hers again. */
function fourHanded(c: GameController): void {
  playWord(c, 'CATS', across(7, [7, 8, 9, 10])); // Ada
  c.pass(); // Sam
  playWord(c, 'MIN', down(8, [4, 5, 6])); // Noor
  playWord(c, 'OE', down(9, [8, 9])); // Kai
}

function syncTransport(rows: readonly SyncRow[], seats: number): GameTransport<GameOptions, LexEntry> {
  const options: GameOptions = {
    rulesetId: 'classic',
    dictionaryId: 'stub',
    bagOrder: riggedBagOrder(classic, RACKS.slice(0, seats)),
    seats,
  };
  const entry: LexEntry = {
    kind: 'sync',
    state: serializeState(initialState(classic, options.bagOrder, seats)),
    myRack: 'CATSERN',
    rows,
  };
  return {
    load: async () => ({ options, log: [entry] }),
    submit: async () => {},
    onRemoteEntry: () => () => {},
    reset: async () => {},
  };
}

const syncRow = (partial: Partial<SyncRow> & { n: number; by: 0 | 1 | 2 }): SyncRow => ({
  kind: 'pass',
  word: null,
  words: [],
  score: 0,
  cells: [],
  ...partial,
});

describe('SheetRow.cells (T7.14)', () => {
  it('records a play’s placement cells on the local-apply path', async () => {
    const c = await table();
    fourHanded(c);
    const sheet = c.getSnapshot().sheet;
    expect(sheet[0]?.cells).toEqual(['7,7', '7,8', '7,9', '7,10']);
    expect(sheet[1]?.cells).toEqual([]); // a pass places nothing
    expect(sheet[2]?.cells).toEqual(['4,8', '5,8', '6,8']);
    expect(sheet[3]?.cells).toEqual(['8,9', '9,9']);
  });

  it('carries the server’s recorded cells through the sync path', async () => {
    const rows: SyncRow[] = [
      syncRow({ n: 0, by: 0, kind: 'play', word: 'CATS', score: 12, cells: ['7,7', '7,8'] }),
      syncRow({ n: 1, by: 1, kind: 'exchange', count: 3 }),
      syncRow({ n: 2, by: 2, kind: 'play', word: 'MINA', score: 9, cells: ['4,8'] }),
    ];
    const c = new GameController(syncTransport(rows, 3), (await table(3)).getSnapshot().options, {
      dict: stubDict(),
    }, 0);
    await c.init();
    const sheet = c.getSnapshot().sheet;
    expect(sheet.map((r) => r.cells)).toEqual([['7,7', '7,8'], [], ['4,8']]);
    // …and the review the cells exist for reads the same rows.
    expect(c.getSnapshot().review?.total).toBe(2);
    c.dispose();
  });
});

describe('the review cursor', () => {
  it('stays null until two moves have happened since you acted', async () => {
    const c = await table();
    expect(c.getSnapshot().review).toBeNull(); // nothing has happened at all
    playWord(c, 'CATS', across(7, [7, 8, 9, 10]));
    // Sam is up with one move behind him — one missed move is exactly what
    // the last-play highlight already tells, so no bar.
    expect(c.getSnapshot().mySeat).toBe(1);
    expect(c.getSnapshot().review).toBeNull();
    c.pass();
    // Noor comes to a board that changed twice: now there is a run to walk.
    expect(c.getSnapshot().mySeat).toBe(2);
    expect(c.getSnapshot().review?.total).toBe(2);
  });

  it('never appears at two seats — the N=2 surface is unchanged', async () => {
    const c = await table(2);
    playWord(c, 'CATS', across(7, [7, 8, 9, 10]));
    playWord(c, 'DOG', down(7, [8, 9, 10]));
    expect(c.getSnapshot().review).toBeNull();
  });

  it('opens on the newest missed move, with the live board', async () => {
    const c = await table();
    fourHanded(c);
    const review = c.getSnapshot().review;
    expect(review).toMatchObject({ index: 2, total: 3 });
    expect(review?.row.by).toBe(3); // Kai, the most recent
    expect(review?.board).toBeNull(); // the newest move IS the live position
  });

  it('steps back and rewinds the board by the cells laid since', async () => {
    const c = await table();
    fourHanded(c);
    c.reviewStep(-1);
    const review = c.getSnapshot().review!;
    expect(review.index).toBe(1);
    expect(review.row.by).toBe(2); // Noor's MINA
    // Kai's two tiles are not on the board as of Noor's move; everything
    // played up to and including it is.
    const live = c.getSnapshot().state.board;
    expect(review.board!.size).toBe(live.size - 2);
    for (const key of review.row.cells) expect(review.board!.has(key as CellKey)).toBe(true);
    for (const key of ['8,9', '9,9']) expect(review.board!.has(key as CellKey)).toBe(false);
  });

  it('clamps at both ends of the window', async () => {
    const c = await table();
    fourHanded(c);
    c.reviewStep(-5);
    expect(c.getSnapshot().review?.index).toBe(0);
    c.reviewStep(5);
    expect(c.getSnapshot().review).toMatchObject({ index: 2, board: null });
  });

  it('exits back to the live board', async () => {
    const c = await table();
    fourHanded(c);
    c.reviewStep(-2);
    expect(c.getSnapshot().review?.board).not.toBeNull();
    c.reviewExit();
    expect(c.getSnapshot().review).toMatchObject({ index: 2, board: null });
  });

  it('drops back to live the moment you stage a tile — you can always act', async () => {
    const c = await table();
    fourHanded(c);
    c.reviewStep(-2);
    expect(c.getSnapshot().review?.board).not.toBeNull();
    expect(c.getSnapshot().interactive).toBe(true); // it is Ada's turn again
    c.placeAt({ row: 3, col: 8 }, 0);
    expect(c.getSnapshot().review?.board).toBeNull();
  });
});

describe('CatchUpBar', () => {
  it('names who did what', () => {
    const row = { n: 0, by: 1, words: [], totals: [], cells: [] } as const;
    expect(describeMove({ ...row, kind: 'play', word: 'QUIZ', score: 68 }, 'Sam')).toBe(
      'Sam played QUIZ +68',
    );
    expect(describeMove({ ...row, kind: 'pass', word: null, score: 0 }, 'Ada')).toBe('Ada passed');
    expect(describeMove({ ...row, kind: 'exchange', word: null, score: 0, count: 3 }, 'Lee')).toBe(
      'Lee exchanged 3',
    );
    expect(describeMove({ ...row, kind: 'resign', word: null, score: 0 }, 'Kai')).toBe(
      'Kai withdrew',
    );
  });

  it('steps and returns to live through its controls', async () => {
    const c = await table();
    fourHanded(c);
    render(<GameBoard controller={c} seatNames={NAMES} />);
    const bar = screen.getByTestId('catch-up-bar');
    expect(bar.textContent).toContain('Kai played');
    // On the newest move there is nowhere forward to go.
    expect(screen.getByTestId('catch-up-next')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('catch-up-live')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByTestId('catch-up-prev'));
    expect(screen.getByTestId('catch-up-bar').textContent).toContain('Noor played');
    expect(screen.getByTestId('catch-up-bar').textContent).toContain('2 of 3');
    fireEvent.click(screen.getByTestId('catch-up-prev'));
    expect(screen.getByTestId('catch-up-bar').textContent).toContain('Sam passed');
    expect(screen.getByTestId('catch-up-prev')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByTestId('catch-up-live'));
    expect(screen.getByTestId('catch-up-bar').textContent).toContain('Kai played');
  });

  it('rewinds the board and highlights the reviewed move — and Play stays reachable', async () => {
    const c = await table();
    fourHanded(c);
    render(<GameBoard controller={c} seatNames={NAMES} />);
    const tiles = () => document.querySelectorAll('[data-cell] [data-tile]').length;
    const live = tiles();

    act(() => c.reviewStep(-1));
    expect(tiles()).toBe(live - 2); // Kai's TOE tiles are not there yet
    // The reviewed move takes over the SAME highlight the last play uses.
    expect(document.querySelectorAll('[data-last-play]')).toHaveLength(3);
    // Reviewing never takes the turn away: the action row is still live.
    expect(screen.getByRole('button', { name: /^pass$/i })).toHaveProperty('disabled', false);

    act(() => c.reviewExit());
    expect(tiles()).toBe(live);
  });

  it('is absent when there is nothing to catch up on', async () => {
    const c = await table(2);
    playWord(c, 'CATS', across(7, [7, 8, 9, 10]));
    render(<GameBoard controller={c} seatNames={NAMES} />);
    expect(screen.queryByTestId('catch-up-bar')).toBeNull();
  });

  it('renders standalone from a review state', () => {
    const review = {
      index: 0,
      total: 3,
      row: {
        n: 1,
        by: 2,
        kind: 'play' as const,
        word: 'QUIZ',
        words: [],
        score: 68,
        cells: [],
        totals: [0, 0, 68],
      },
      board: new Map(),
    };
    render(
      <CatchUpBar
        review={review}
        names={NAMES}
        onPrev={() => {}}
        onNext={() => {}}
        onLive={() => {}}
      />,
    );
    expect(screen.getByTestId('catch-up-bar').textContent).toContain('Noor played QUIZ +68');
    expect(screen.getByTestId('catch-up-live')).toHaveProperty('disabled', false);
  });
});
