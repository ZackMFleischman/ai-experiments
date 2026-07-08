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

/** Drawn bbox per symbol inside its 100×100 viewBox (measured via getBBox —
 * see DECISIONS.md). The raw art varies in reach (legs, crowns), so UI that
 * shows glyphs side by side (guide, info card) normalizes with FittedGlyph;
 * board tiles keep the reviewed T6.1 rendering. */
export const GLYPH_METRICS: Readonly<Record<string, { extent: number; cx: number; cy: number }>> = {
  'bug-queen': { extent: 85, cx: 50, cy: 48.5 },
  'bug-ant': { extent: 81, cx: 50, cy: 50.6 },
  'bug-spider': { extent: 76, cx: 50, cy: 53 },
  'bug-grasshopper': { extent: 73, cx: 54, cy: 47.5 },
  'bug-beetle': { extent: 82, cx: 50, cy: 49 },
  'bug-mosquito': { extent: 80, cx: 50, cy: 49 },
  'bug-ladybug': { extent: 77, cx: 50, cy: 47.5 },
  'bug-pillbug': { extent: 61, cx: 50, cy: 51.5 },
  'bear-queen': { extent: 91, cx: 50, cy: 48.5 },
  'bear-ant': { extent: 74.5, cx: 50, cy: 56.8 },
  'bear-spider': { extent: 68, cx: 50, cy: 60 },
  'bear-grasshopper': { extent: 68.5, cx: 50, cy: 59.8 },
  'bear-beetle': { extent: 72, cx: 50, cy: 53.5 },
  'bear-mosquito': { extent: 74, cx: 50, cy: 57 },
  'bear-ladybug': { extent: 70, cx: 50, cy: 57 },
  'bear-pillbug': { extent: 72, cx: 50, cy: 58 },
};

/** A sprite glyph normalized to a `size`-wide box centered on the origin —
 * every piece reads the same visual size regardless of the raw art's reach. */
export function FittedGlyph({ symbol, size }: { symbol: string; size: number }) {
  const m = GLYPH_METRICS[symbol];
  if (!m) return <use href={`#${symbol}`} x={-size / 2} y={-size / 2} width={size} height={size} />;
  const k = size / m.extent;
  return (
    <g transform={`scale(${k}) translate(${50 - m.cx}, ${50 - m.cy})`}>
      <use href={`#${symbol}`} x={-50} y={-50} width={100} height={100} />
    </g>
  );
}

export function SpriteSheet() {
  // eslint-disable-next-line react/no-danger
  return <div data-testid="hive-sprites" dangerouslySetInnerHTML={{ __html: spritesRaw }} />;
}
