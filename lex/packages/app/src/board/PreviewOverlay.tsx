// Live-preview overlay (T3.7): word chips positioned in board space so they
// ride the viewport transform with the tiles they annotate. Each chip carries
// its word's score — no separate total badge (it duplicated the main chip and
// obscured the board). Everything shown is a controller verdict — no scoring
// or legality here.
import { Box } from '@mui/material';
import type React from 'react';
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
  /** Tapping a word chip asks for its definition (T7.2). Omitted = chips are
   * inert, which is what the gallery's static states want. */
  onDefine?: (word: string) => void;
}

const cellLeft = (col: number) => BOARD_PAD_PX + col * CELL_PX;
const cellTop = (row: number) => BOARD_PAD_PX + row * CELL_PX;

export function PreviewOverlay({ preview, anchor, onDefine }: PreviewOverlayProps) {
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

  // A word chip is ~18px tall in board space — far under the 44px minimum
  // (NFR-7) — so the tap target is an invisible box grown around it rather
  // than a bigger chip, which would cover the tiles it annotates.
  const tappableChip = {
    ...chip,
    pointerEvents: 'auto' as const,
    cursor: 'pointer',
    border: 0,
    font: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    '&::before': { content: '""', position: 'absolute', inset: '-13px -8px' },
    '&:focus-visible': { outline: '2px solid', outlineOffset: 2 },
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

  return (
    <>
      {preview.words.map((w, i) => {
        const at = w.cells[0]!;
        const label = `${w.word} ${w.score} ${w.valid ? '✓' : '✗'}${i === 0 && preview.bingo ? '★' : ''}`;
        const placement = {
          left: cellLeft(at.col),
          top: cellTop(at.row) - 24 - i * 2, // slight cascade on pileups
          bgcolor: w.valid ? 'success.main' : 'error.main',
          color: w.valid ? 'success.contrastText' : 'error.contrastText',
        };
        // Invalid words stay tappable on purpose: "why isn't that a word?" is
        // the moment a player most wants a definition, and the link-out answers
        // it even when the bundled glossary can't.
        return onDefine ? (
          <Box
            component="button"
            type="button"
            key={`${w.word}-${i}`}
            data-testid="preview-chip"
            data-valid={w.valid ? 'true' : 'false'}
            aria-label={`Define ${w.word}`}
            // The viewport pans on pointerdown; a tap meant for the chip must
            // not also drag the board out from under it.
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            onClick={() => onDefine(w.word)}
            sx={{ ...tappableChip, ...placement }}
          >
            {label}
          </Box>
        ) : (
          <Box
            key={`${w.word}-${i}`}
            data-testid="preview-chip"
            data-valid={w.valid ? 'true' : 'false'}
            sx={{ ...chip, ...placement }}
          >
            {label}
          </Box>
        );
      })}
    </>
  );
}
