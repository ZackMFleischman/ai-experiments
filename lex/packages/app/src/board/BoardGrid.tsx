// The board: a DOM/CSS grid rendered entirely from BoardLayout (DESIGN §7.2).
// Premium cells are colored AND labeled (color is never the only signal); the
// start cell carries the star. Committed tiles cover their cell's markings.
// The grid is fixed-size in px (cells = var(--lex-cell)); the viewport (T3.2)
// scales it with a CSS transform.
import { Box } from '@mui/material';
import type { BoardLayout, Cell, CellKey, PlacedTile, Premium, TileFace, TileSet } from '@lex/engine';
import { cellKey } from '@lex/engine';
import { useColorMode } from '../theme';
import { BOARD_PAD_PX, CELL_PX, skinVars } from './skin';
import { Tile } from './Tile';

const PREMIUM_BG: Record<Premium, string> = {
  DL: 'var(--lex-cell-dl)',
  TL: 'var(--lex-cell-tl)',
  DW: 'var(--lex-cell-dw)',
  TW: 'var(--lex-cell-tw)',
};

/** Untransformed board size in px — feeds the viewport (T3.2). */
export function boardPixelSize(layout: BoardLayout): { width: number; height: number } {
  return {
    width: layout.cols * CELL_PX + 2 * BOARD_PAD_PX,
    height: layout.rows * CELL_PX + 2 * BOARD_PAD_PX,
  };
}

/** Board-space point → cell, or null off the grid. One subtraction + one
 * division — the whole transform-proof hit test (DESIGN §7.2). */
export function pointToCell(pt: { x: number; y: number }, layout: BoardLayout): Cell | null {
  const col = Math.floor((pt.x - BOARD_PAD_PX) / CELL_PX);
  const row = Math.floor((pt.y - BOARD_PAD_PX) / CELL_PX);
  if (row < 0 || col < 0 || row >= layout.rows || col >= layout.cols) return null;
  return { row, col };
}

/** What the grid needs to draw a staged tile (structural subset of the
 * controller's PendingTile). */
export interface PendingCellTile {
  face: TileFace;
  letter: string | null;
  isBlank: boolean;
}

export interface BoardGridProps {
  layout: BoardLayout;
  /** Point values from the ruleset's TileSet — data, not rules. */
  points: TileSet['points'];
  tiles: ReadonlyMap<CellKey, PlacedTile>;
  /** Staged-but-unsubmitted tiles — lifted, gold edge (T3.5). */
  pending?: ReadonlyMap<CellKey, PendingCellTile>;
  /** Cell under an in-flight drag. */
  hover?: CellKey | null;
}

export function BoardGrid({ layout, points, tiles, pending, hover }: BoardGridProps) {
  const { mode } = useColorMode();
  const startKey = cellKey(layout.start);

  const cells = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const key: CellKey = `${row},${col}`;
      const premium = layout.premiums[key];
      const tile = tiles.get(key);
      const staged = pending?.get(key);
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
            ...(hover === key && {
              outline: '2px solid var(--lex-tile-pending-edge)',
              outlineOffset: '-2px',
              zIndex: 1,
            }),
          }}
        >
          {tile ? (
            <Tile letter={tile.letter} isBlank={tile.isBlank} points={points[tile.letter] ?? 0} />
          ) : staged ? (
            <Tile
              letter={staged.letter ?? ''}
              isBlank={staged.isBlank}
              points={points[staged.face] ?? 0}
              pending
            />
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
