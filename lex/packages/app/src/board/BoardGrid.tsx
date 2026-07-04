// The board: a DOM/CSS grid rendered entirely from BoardLayout (DESIGN §7.2).
// Premium cells are colored AND labeled (color is never the only signal); the
// start cell carries the star. Committed tiles cover their cell's markings.
// The grid is fixed-size in px (cells = var(--lex-cell)); the viewport (T3.2)
// scales it with a CSS transform.
import { Box } from '@mui/material';
import type { BoardLayout, CellKey, PlacedTile, Premium, TileSet } from '@lex/engine';
import { cellKey } from '@lex/engine';
import { useColorMode } from '../theme';
import { skinVars } from './skin';
import { Tile } from './Tile';

const PREMIUM_BG: Record<Premium, string> = {
  DL: 'var(--lex-cell-dl)',
  TL: 'var(--lex-cell-tl)',
  DW: 'var(--lex-cell-dw)',
  TW: 'var(--lex-cell-tw)',
};

export interface BoardGridProps {
  layout: BoardLayout;
  /** Point values from the ruleset's TileSet — data, not rules. */
  points: TileSet['points'];
  tiles: ReadonlyMap<CellKey, PlacedTile>;
}

export function BoardGrid({ layout, points, tiles }: BoardGridProps) {
  const { mode } = useColorMode();
  const startKey = cellKey(layout.start);

  const cells = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const key: CellKey = `${row},${col}`;
      const premium = layout.premiums[key];
      const tile = tiles.get(key);
      cells.push(
        <Box
          key={key}
          data-cell={key}
          data-premium={premium}
          role="gridcell"
          sx={{
            width: 'var(--lex-cell)',
            height: 'var(--lex-cell)',
            bgcolor: premium ? PREMIUM_BG[premium] : 'var(--lex-cell-bg)',
            border: '1px solid var(--lex-cell-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          {tile ? (
            <Tile letter={tile.letter} isBlank={tile.isBlank} points={points[tile.letter] ?? 0} />
          ) : key === startKey ? (
            <Box
              component="span"
              data-star
              aria-hidden
              sx={{ color: 'var(--lex-premium-fg)', fontSize: 'calc(var(--lex-cell) * 0.55)', lineHeight: 1 }}
            >
              ★
            </Box>
          ) : premium ? (
            <Box
              component="span"
              aria-hidden
              sx={{
                color: 'var(--lex-premium-fg)',
                fontSize: 'calc(var(--lex-cell) * 0.3)',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              {premium}
            </Box>
          ) : null}
        </Box>,
      );
    }
  }

  return (
    <Box
      role="grid"
      aria-label={`${layout.id} board`}
      data-board={layout.id}
      sx={{
        ...skinVars(mode),
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.cols}, var(--lex-cell))`,
        bgcolor: 'var(--lex-board-bg)',
        p: '2px',
        width: 'fit-content',
        touchAction: 'none',
      }}
    >
      {cells}
    </Box>
  );
}
