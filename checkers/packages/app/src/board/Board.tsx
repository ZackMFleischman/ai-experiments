// The 8×8 board. Pure presentation: it renders engine state and the
// engine's own legalMovesFrom() — never computes a rule. Squares are a CSS
// grid of buttons (keyboard + screen-reader friendly: each square is
// labelled 'b3' with its occupant); selecting a piece dots the LANDING
// squares of its complete legal paths, and tapping a dot submits the whole
// path — multi-jumps ride along for free. The last move gets a soft wash on
// its endpoints.
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import {
  BOARD_SIZE,
  cellName,
  legalMovesFrom,
  pieceAt,
  sideOf,
  type Piece,
  type CheckersMove,
  type CheckersState,
} from '@checkers/engine';
import { useMemo, useState } from 'react';

export interface BoardProps {
  state: CheckersState;
  /** Attempt a move (already engine-legal — it came from the dots). */
  onMove?: ((move: CheckersMove) => void) | undefined;
  /** Which side may pick pieces up right now (hot-seat: the side to move;
   * online: my side on my turn; undefined: display only). */
  actingSide?: 'dark' | 'light' | undefined;
  lastMove?: CheckersMove | undefined;
}

function PieceGlyph({ piece, size }: { piece: Piece; size: string }) {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const paper = theme.palette.background.paper;
  if (piece === '.') return null;
  const dark = piece === 'd' || piece === 'D';
  const king = piece === 'D' || piece === 'L';
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: dark ? ink : paper,
        border: 2,
        borderColor: ink,
        display: 'grid',
        placeItems: 'center',
        color: dark ? paper : ink,
        fontSize: `calc(${size} * 0.5)`,
        lineHeight: 1,
      }}
    >
      {king ? '♛' : ''}
    </Box>
  );
}

export function Board({ state, onMove, actingSide, lastMove }: BoardProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);

  // Landing square → the complete path to submit. When two paths of the same
  // piece share a landing square (rare double-jump geometry), the first one
  // wins — a v1 simplification recorded in DECISIONS.md.
  const targets = useMemo(() => {
    const map = new Map<number, number[]>();
    if (selected === null) return map;
    for (const move of legalMovesFrom(state, selected)) {
      const landing = move.path[move.path.length - 1];
      if (landing !== undefined && !map.has(landing)) map.set(landing, move.path);
    }
    return map;
  }, [state, selected]);

  const pick = (cell: number): void => {
    if (!onMove || !actingSide || state.result) return;
    const path = selected !== null ? targets.get(cell) : undefined;
    if (path) {
      setSelected(null);
      onMove({ path });
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
  const lastCells = new Set(
    lastMove ? [lastMove.path[0] ?? -1, lastMove.path[lastMove.path.length - 1] ?? -1] : [],
  );

  return (
    <Box
      role="grid"
      aria-label="checkers board"
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
        const playable = (row + col) % 2 === 1; // the dark squares
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
                  : playable
                    ? theme.palette.board.cell
                    : 'transparent',
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: -2,
              },
            }}
          >
            <PieceGlyph piece={piece} size="72%" />
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
  if (piece === 'd') return 'dark man';
  if (piece === 'D') return 'dark king';
  if (piece === 'l') return 'light man';
  return 'light king';
}
