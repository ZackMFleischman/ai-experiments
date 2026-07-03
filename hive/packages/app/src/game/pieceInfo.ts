// Piece names + movement copy, shared by the guide dialog, board/tray hover
// titles, and the long-press info card. Descriptive only — legality always
// comes from the engine.
import type { BugKind } from '@hive/engine';

export interface PieceInfo {
  kind: BugKind;
  name: string;
  rule: string;
}

export const PIECES: ReadonlyArray<PieceInfo> = [
  {
    kind: 'Q',
    name: 'Queen Bee',
    rule: 'Slides one space. Must be placed by your fourth turn — lose her to a full surround and you lose the game.',
  },
  { kind: 'A', name: 'Ant', rule: 'Slides any distance around the outside of the hive.' },
  { kind: 'S', name: 'Spider', rule: 'Slides exactly three spaces around the hive, no backtracking.' },
  {
    kind: 'G',
    name: 'Grasshopper',
    rule: 'Jumps in a straight line over one or more pieces to the first empty space.',
  },
  {
    kind: 'B',
    name: 'Beetle',
    rule: 'Moves one space, and may climb on top of the hive — the piece it covers is pinned.',
  },
  {
    kind: 'M',
    name: 'Mosquito',
    rule: 'Copies the movement of any piece it touches. On top of the hive it moves as a beetle.',
  },
  {
    kind: 'L',
    name: 'Ladybug',
    rule: 'Moves exactly two spaces on top of the hive, then one space down.',
  },
  {
    kind: 'P',
    name: 'Pillbug',
    rule: 'Moves one space, or instead lifts an adjacent piece and sets it down on an empty space beside it.',
  },
];

export const PIECE_INFO: Readonly<Record<BugKind, PieceInfo>> = Object.fromEntries(
  PIECES.map((p) => [p.kind, p]),
) as Record<BugKind, PieceInfo>;

/** The rest of the rules, one line each (guide dialog footer). */
export const GAME_RULES: ReadonlyArray<{ title: string; text: string }> = [
  { title: 'Goal', text: 'Fully surround the enemy Queen Bee — all six neighbours, either color.' },
  {
    title: 'Each turn',
    text: 'Either place a new piece from your tray or move one already on the board.',
  },
  {
    title: 'Placement',
    text: 'After the opening two tiles, a new piece may only touch your own color.',
  },
  {
    title: 'Your queen',
    text: "Must be placed by your fourth turn, and none of your pieces may move until she's down.",
  },
  {
    title: 'One hive',
    text: 'The hive can never split — any move that would disconnect it is illegal.',
  },
  {
    title: 'Sliding',
    text: 'Sliders can’t squeeze through gaps narrower than a tile; jumpers and climbers ignore gaps.',
  },
  { title: 'Stuck?', text: 'If you have no legal move, you pass — the game does not end on passes.' },
  {
    title: 'Game end',
    text: 'Surrounding a queen wins; both queens at once, an agreed draw, or threefold repetition is a draw.',
  },
];
