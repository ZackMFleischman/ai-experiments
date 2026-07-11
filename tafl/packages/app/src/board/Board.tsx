// The 7×7 board. Pure presentation: it renders engine state and the
// engine's own legalDestinations() — never computes a rule. Squares are a
// CSS grid of buttons (keyboard + screen-reader friendly: each square is
// labelled 'd4' with its occupant); the selected piece's legal targets get a
// quiet dot, the last move a soft wash, restricted squares their motif.
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import {
  BOARD_SIZE,
  CORNERS,
  THRONE,
  cellName,
  legalDestinations,
  pieceAt,
  sideOf,
  type Piece,
  type TaflMove,
  type TaflState,
} from '@tafl/engine';
import { useMemo, useState } from 'react';

export interface BoardProps {
  state: TaflState;
  /** Attempt a move (already engine-legal — it came from the dots). */
  onMove?: ((move: TaflMove) => void) | undefined;
  /** Which side may pick pieces up right now (hot-seat: the side to move;
   * online: my side on my turn; undefined: display only). */
  actingSide?: 'attackers' | 'defenders' | undefined;
  lastMove?: TaflMove | undefined;
}

function PieceGlyph({ piece, size }: { piece: Piece; size: string }) {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const paper = theme.palette.background.paper;
  const accent = theme.palette.primary.main;
  if (piece === 'A') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '28%',
          bgcolor: ink,
          transform: 'rotate(45deg)',
        }}
      />
    );
  }
  if (piece === 'D') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: paper,
          border: 2,
          borderColor: ink,
        }}
      />
    );
  }
  if (piece === 'K') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: accent,
          display: 'grid',
          placeItems: 'center',
          color: theme.palette.primary.contrastText,
          fontSize: `calc(${size} * 0.62)`,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        ♜
      </Box>
    );
  }
  return null;
}

export function Board({ state, onMove, actingSide, lastMove }: BoardProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);

  const targets = useMemo(
    () => (selected === null ? new Set<number>() : new Set(legalDestinations(state, selected))),
    [state, selected],
  );

  const pick = (cell: number): void => {
    if (!onMove || !actingSide || state.result) return;
    if (selected !== null && targets.has(cell)) {
      setSelected(null);
      onMove({ from: selected, to: cell });
      return;
    }
    const piece = pieceAt(state, cell);
    if (sideOf(piece) === actingSide && state.toMove === actingSide) {
      setSelected(selected === cell ? null : cell);
    } else {
      setSelected(null);
    }
  };

  const cells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => i);
  const restricted = new Set<number>([THRONE, ...CORNERS]);
  const lastCells = new Set(lastMove ? [lastMove.from, lastMove.to] : []);

  return (
    <Box
      role="grid"
      aria-label="tafl board"
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        aspectRatio: '1',
        width: '100%',
        maxWidth: 480,
        mx: 'auto',
        border: 2,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: theme.palette.board.surface,
      }}
    >
      {cells.map((cell) => {
        const piece = pieceAt(state, cell);
        const row = Math.floor(cell / BOARD_SIZE);
        const col = cell % BOARD_SIZE;
        const checker = (row + col) % 2 === 1;
        const label = piece === '.' ? cellName(cell) : `${cellName(cell)} ${pieceLabel(piece)}`;
        return (
          <Box
            key={cell}
            component="button"
            type="button"
            role="gridcell"
            aria-label={label}
            {...(selected === cell ? { 'aria-selected': true } : {})}
            onClick={() => pick(cell)}
            sx={{
              all: 'unset',
              boxSizing: 'border-box',
              cursor: onMove ? 'pointer' : 'default',
              display: 'grid',
              placeItems: 'center',
              position: 'relative',
              aspectRatio: '1',
              bgcolor: lastCells.has(cell)
                ? alpha(theme.palette.primary.main, 0.18)
                : selected === cell
                  ? alpha(theme.palette.primary.main, 0.28)
                  : checker
                    ? alpha(theme.palette.text.primary, 0.05)
                    : 'transparent',
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: -2,
              },
            }}
          >
            {restricted.has(cell) && piece === '.' && (
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  inset: '30%',
                  border: 1.5,
                  borderColor: alpha(theme.palette.text.primary, 0.35),
                  borderRadius: cell === THRONE ? '50%' : '20%',
                }}
              />
            )}
            <PieceGlyph piece={piece} size="68%" />
            {targets.has(cell) && (
              <Box
                aria-hidden
                data-testid="move-target"
                sx={{
                  position: 'absolute',
                  width: '22%',
                  height: '22%',
                  borderRadius: '50%',
                  bgcolor: alpha(theme.palette.primary.main, 0.55),
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function pieceLabel(piece: Piece): string {
  return piece === 'A' ? 'attacker' : piece === 'D' ? 'defender' : 'king';
}
