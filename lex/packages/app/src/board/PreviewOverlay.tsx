// Live-preview overlay (T3.7): word chips + total badge, positioned in board
// space so they ride the viewport transform with the tiles they annotate.
// Everything shown is a controller verdict — no scoring or legality here.
import { Box } from '@mui/material';
import type { CellKey } from '@lex/engine';
import { parseCellKey } from '@lex/engine';
import type { Preview } from '../controller/GameController';
import { BOARD_PAD_PX, CELL_PX } from './skin';

const REASON_COPY: Record<string, string> = {
  'not-your-tiles': 'Not your tiles',
  'not-a-line': 'One line only',
  gap: 'No gaps in the word',
  'first-play-center': 'First word covers the star',
  'first-play-too-short': 'Two tiles minimum',
  'not-connected': 'Must connect to a word',
  occupied: 'Cell is taken',
  'off-board': 'Off the board',
};

export interface PreviewOverlayProps {
  preview: Preview | null;
  /** Where to anchor the geometry-reason chip (first staged cell). */
  anchor: CellKey | null;
}

const cellLeft = (col: number) => BOARD_PAD_PX + col * CELL_PX;
const cellTop = (row: number) => BOARD_PAD_PX + row * CELL_PX;

export function PreviewOverlay({ preview, anchor }: PreviewOverlayProps) {
  if (!preview || preview.needsBlank) return null; // the picker is up

  const chip = {
    position: 'absolute' as const,
    px: 0.75,
    py: 0.1,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: '18px',
    whiteSpace: 'nowrap' as const,
    boxShadow: 1,
    pointerEvents: 'none' as const,
    zIndex: 2,
  };

  if (!preview.check.ok) {
    if (!anchor) return null;
    const cell = parseCellKey(anchor);
    return (
      <Box
        data-testid="preview-reason"
        sx={{
          ...chip,
          left: cellLeft(cell.col),
          top: cellTop(cell.row) - 24,
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
        }}
      >
        {REASON_COPY[preview.check.reason] ?? preview.check.reason}
      </Box>
    );
  }

  const main = preview.words[0];
  const mainEnd = main?.cells[main.cells.length - 1];

  return (
    <>
      {preview.words.map((w, i) => {
        const at = w.cells[0]!;
        return (
          <Box
            key={`${w.word}-${i}`}
            data-testid="preview-chip"
            data-valid={w.valid ? 'true' : 'false'}
            sx={{
              ...chip,
              left: cellLeft(at.col),
              top: cellTop(at.row) - 24 - i * 2, // slight cascade on pileups
              bgcolor: w.valid ? 'success.main' : 'error.main',
              color: w.valid ? 'success.contrastText' : 'error.contrastText',
            }}
          >
            {w.word} {w.score} {w.valid ? '✓' : '✗'}
          </Box>
        );
      })}
      {mainEnd && (
        <Box
          data-testid="preview-total"
          sx={{
            ...chip,
            left: cellLeft(mainEnd.col + 1) + 4,
            top: cellTop(mainEnd.row) + 4,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            fontSize: 15,
            borderRadius: '50%',
            minWidth: 28,
            textAlign: 'center',
          }}
        >
          {preview.total}
          {preview.bingo ? '★' : ''}
        </Box>
      )}
    </>
  );
}
