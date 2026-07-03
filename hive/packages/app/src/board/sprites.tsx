// The sprite sheet is the single art source (DESIGN §6.4): inject it once,
// reference everything via <use href="#...">.
import type { BugKind } from '@hive/engine';
import spritesRaw from '../assets/hive-sprites.svg?raw';

export const BUG_SYMBOL: Record<BugKind, string> = {
  Q: 'bug-queen',
  A: 'bug-ant',
  S: 'bug-spider',
  G: 'bug-grasshopper',
  B: 'bug-beetle',
  M: 'bug-mosquito',
  L: 'bug-ladybug',
  P: 'bug-pillbug',
};

/** Bear-mode glyphs (pieceArt.tsx): same pieces, one bear species each. */
export const BEAR_SYMBOL: Record<BugKind, string> = {
  Q: 'bear-queen',
  A: 'bear-ant',
  S: 'bear-spider',
  G: 'bear-grasshopper',
  B: 'bear-beetle',
  M: 'bear-mosquito',
  L: 'bear-ladybug',
  P: 'bear-pillbug',
};

export const ALL_SYMBOLS = [
  'hex-base',
  'hex-ghost',
  ...Object.values(BUG_SYMBOL),
  ...Object.values(BEAR_SYMBOL),
  'motif-crown',
  'motif-tile',
];

export function SpriteSheet() {
  // eslint-disable-next-line react/no-danger
  return <div data-testid="hive-sprites" dangerouslySetInnerHTML={{ __html: spritesRaw }} />;
}
