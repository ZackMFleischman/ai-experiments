// Mini board (T4.7): the real board renderer scaled down — lobby thumbnails
// (with tiles from the public snapshot) and the new-game board picker's
// premium-map preview (empty). Decorative: no pointer events, aria-hidden.
import { Box } from '@mui/material';
import type { CellKey, PlacedTile } from '@lex/engine';
import { RULESETS } from '@lex/engine';
import { useMemo } from 'react';
import { BoardGrid, boardPixelSize } from './BoardGrid';

const EMPTY: ReadonlyMap<CellKey, PlacedTile> = new Map();

export function MiniBoard({
  rulesetId,
  tiles = EMPTY,
  size = 84,
}: {
  rulesetId: string;
  tiles?: ReadonlyMap<CellKey, PlacedTile>;
  size?: number;
}) {
  const ruleset = RULESETS[rulesetId];
  const dims = useMemo(
    () => (ruleset ? boardPixelSize(ruleset.board) : { width: 1, height: 1 }),
    [ruleset],
  );
  if (!ruleset) return null;
  const scale = size / Math.max(dims.width, dims.height);
  return (
    <Box
      aria-hidden
      data-testid="mini-board"
      sx={{ width: size, height: size, pointerEvents: 'none', flexShrink: 0, overflow: 'hidden' }}
    >
      <Box sx={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <BoardGrid layout={ruleset.board} points={ruleset.tiles.points} tiles={tiles} static />
      </Box>
    </Box>
  );
}
