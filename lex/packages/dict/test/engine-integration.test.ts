// T2.4: engine integration — applyMove's play path over a REAL compiled
// dictionary; per-word verdicts for the UI; one bad cross-word rejects the
// whole play and names it; validity is case-insensitive (IMPLEMENTATION §6).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  RULESETS,
  applyMove,
  checkPlay,
  initialState,
  type GameState,
  type Placement,
  type TileFace,
} from '@lex/engine';
import { buildDawg, decodeDawg, type DawgDictionary } from '../src/dawg.js';
import { normalizeWordList } from '../src/wordlist.js';

const classic = RULESETS.classic!;
let dict: DawgDictionary;

beforeAll(() => {
  const raw = readFileSync(new URL('../words/2of12inf.txt', import.meta.url), 'utf8');
  const words = normalizeWordList(raw);
  const hash = createHash('sha256').update(words.join('\n')).digest('hex');
  dict = decodeDawg(buildDawg(words, '2of12inf', hash));
});

function place(row: number, col: number, letter: string, isBlank = false): Placement {
  return { cell: { row, col }, letter, isBlank };
}

/** A mid-game state with a rigged seat-0 rack and a hand-built board.
 * (applyMove trusts state shape, so board tiles need not leave the bag.) */
function stateWith(board: ReadonlyArray<readonly [number, number, string]>, rack: readonly TileFace[]): GameState {
  const remaining: Record<string, number> = { ...classic.tiles.counts };
  for (const face of rack) remaining[face] = (remaining[face] ?? 0) - 1;
  const rest: TileFace[] = [];
  for (const [face, count] of Object.entries(remaining)) {
    if (count < 0) throw new Error(`fixture over-uses '${face}'`);
    for (let i = 0; i < count; i++) rest.push(face);
  }
  const boardMap = new Map(board.map(([row, col, letter]) => [`${row},${col}`, { letter, isBlank: false }]));
  return { ...initialState(classic, [...rack, ...rest], 2), board: boardMap, moveCount: 4 };
}

describe('applyMove with a real dictionary', () => {
  it('accepts a play whose every formed word is real', () => {
    const state = stateWith([[7, 7, 'C'], [7, 8, 'A'], [7, 9, 'T']], ['S', 'E', 'E', 'E', 'E', 'A', 'A']);
    const next = applyMove(state, { type: 'play', placements: [place(7, 10, 'S')] }, dict);
    expect(next.board.get('7,10')).toEqual({ letter: 'S', isBlank: false });
    expect(next.scores[0]).toBeGreaterThan(0);
  });

  it('one invalid cross-word rejects the whole play and names it', () => {
    // Board holds a lone Q; playing OX under it forms main OX (valid) and
    // cross QO (never a word) — the WHOLE play must be rejected.
    const state = stateWith([[6, 6, 'Q'], [6, 7, 'U'], [6, 8, 'A'], [6, 9, 'D'], [6, 10, 'S']], ['O', 'X', 'E', 'E', 'E', 'A', 'A']);
    expect(dict.has('OX')).toBe(true); // guard: main word is real
    expect(dict.has('QO')).toBe(false); // guard: cross is not
    let thrown: unknown;
    try {
      applyMove(state, { type: 'play', placements: [place(7, 6, 'O'), place(7, 7, 'X')] }, dict);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IllegalMoveError);
    const error = thrown as IllegalMoveError;
    expect(error.reason).toBe('invalid-word');
    expect(error.words).toContain('QO');
    expect(error.message).toContain('QO');
    // board untouched — the play did not partially apply
    expect(state.board.has('7,6')).toBe(false);
  });

  it('names every invalid word when several fail', () => {
    const state = stateWith([[6, 6, 'Q'], [6, 8, 'Q'], [6, 7, 'U']], ['O', 'X', 'O', 'E', 'E', 'A', 'A']);
    let thrown: unknown;
    try {
      // O under each Q: crosses QO and QO... vary: O X O forming QO, UX, QO
      applyMove(state, { type: 'play', placements: [place(7, 6, 'O'), place(7, 7, 'X'), place(7, 8, 'O')] }, dict);
    } catch (error) {
      thrown = error;
    }
    const error = thrown as IllegalMoveError;
    expect(error).toBeInstanceOf(IllegalMoveError);
    expect(error.words?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('per-word verdicts for the UI (DESIGN §5.2 stage 3)', () => {
  it('checkPlay words map to individual dict verdicts', () => {
    const board = new Map([
      ['6,6', { letter: 'Q', isBlank: false }],
      ['6,7', { letter: 'U', isBlank: false }],
    ]);
    const rack: TileFace[] = ['O', 'X', 'E', 'E', 'E', 'A', 'A'];
    const check = checkPlay(board, rack, [place(7, 6, 'O'), place(7, 7, 'X')], classic);
    if (!check.ok) throw new Error(`expected ok, got ${check.reason}`);
    const verdicts = check.words.map((w) => ({ word: w.word, valid: dict.has(w.word) }));
    expect(verdicts).toEqual([
      { word: 'OX', valid: true },
      { word: 'QO', valid: false },
      { word: 'UX', valid: false },
    ]);
  });

  it('verdicts are case-insensitive', () => {
    expect(dict.has('ox')).toBe(true);
    expect(dict.has('Ox')).toBe(true);
    expect(dict.has('OX')).toBe(true);
  });
});
