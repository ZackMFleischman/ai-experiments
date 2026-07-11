// The 11×11 board. Pure presentation: it renders engine state and the
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

/** Piece glyphs, shared with the turn indicator: attackers are dark diamonds,
 * defenders pale rounds, the king the accent piece. A soft top-light gradient
 * and drop shadow give them the carved-piece depth of a physical set. */
export function PieceGlyph({
  piece,
  size,
  selected = false,
}: {
  piece: Piece;
  size: string;
  selected?: boolean;
}) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const ink = dark ? '#2e2528' : '#3b2e31'; // warm near-black, like carved horn
  const bone = dark ? '#e8e2d4' : '#f7f3e8'; // pale bone for the defenders
  const accent = theme.palette.primary.main;
  const lift = selected ? 'translateY(-6%) scale(1.06)' : 'none';
  const shadow = selected
    ? `0 ${dark ? '3px 7px' : '3px 6px'} ${alpha('#000', dark ? 0.6 : 0.35)}`
    : `0 1px 3px ${alpha('#000', dark ? 0.5 : 0.25)}`;
  if (piece === 'A') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '28%',
          background: `linear-gradient(135deg, ${alpha('#fff', 0.22)}, transparent 55%), ${ink}`,
          // scale(0.8) keeps the rotated diamond's diagonal inside the square.
          transform: `${lift === 'none' ? '' : `${lift} `}rotate(45deg) scale(0.8)`.trim(),
          boxShadow: shadow,
          transition: 'transform 120ms ease, box-shadow 120ms ease',
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
          background: `linear-gradient(135deg, ${alpha('#fff', 0.65)}, transparent 60%), ${bone}`,
          border: 2,
          borderColor: alpha(ink, 0.85),
          boxShadow: shadow,
          transform: lift,
          transition: 'transform 120ms ease, box-shadow 120ms ease',
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
          background: `linear-gradient(135deg, ${alpha('#fff', 0.3)}, transparent 55%), ${accent}`,
          display: 'grid',
          placeItems: 'center',
          color: theme.palette.primary.contrastText,
          fontSize: `calc(${size} * 0.58)`,
          lineHeight: 1,
          fontWeight: 700,
          boxShadow: shadow,
          transform: lift,
          transition: 'transform 120ms ease, box-shadow 120ms ease',
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
  const dark = theme.palette.mode === 'dark';
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

  const field = dark ? '#1a181c' : '#f2eddd'; // parchment / smoke
  const line = alpha(dark ? '#f2eddd' : '#3b2e31', dark ? 0.14 : 0.18);
  const frame = alpha(dark ? '#f2eddd' : '#3b2e31', dark ? 0.4 : 0.65);

  return (
    <Box
      role="grid"
      aria-label="tafl board"
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        aspectRatio: '1',
        width: '100%',
        mx: 'auto',
        border: 2,
        borderColor: frame,
        borderRadius: 1.5,
        overflow: 'hidden',
        bgcolor: field,
        boxShadow: dark
          ? `0 4px 24px ${alpha('#000', 0.5)}`
          : `0 4px 20px ${alpha('#3b2e31', 0.14)}`,
        touchAction: 'manipulation',
      }}
    >
      {cells.map((cell) => {
        const piece = pieceAt(state, cell);
        const isThrone = cell === THRONE;
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
              WebkitTapHighlightColor: 'transparent',
              // The woven grid: hairlines on every square, a quiet tint on the
              // king's squares (throne + corners) so the goal reads at a glance.
              boxShadow: `inset 0 0 0 0.5px ${line}`,
              bgcolor: lastCells.has(cell)
                ? alpha(theme.palette.primary.main, dark ? 0.22 : 0.16)
                : selected === cell
                  ? alpha(theme.palette.primary.main, dark ? 0.34 : 0.26)
                  : restricted.has(cell)
                    ? alpha(theme.palette.primary.main, dark ? 0.1 : 0.08)
                    : 'transparent',
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: -2,
                zIndex: 1,
              },
            }}
          >
            {restricted.has(cell) && piece === '.' && (
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  inset: '26%',
                  border: 1.5,
                  borderColor: alpha(theme.palette.primary.main, dark ? 0.6 : 0.5),
                  borderRadius: isThrone ? '50%' : '22%',
                  '&::after': isThrone
                    ? {
                        content: '""',
                        position: 'absolute',
                        inset: '28%',
                        borderRadius: '50%',
                        bgcolor: alpha(theme.palette.primary.main, dark ? 0.5 : 0.4),
                      }
                    : undefined,
                }}
              />
            )}
            <PieceGlyph piece={piece} size="78%" selected={selected === cell} />
            {targets.has(cell) && (
              <Box
                aria-hidden
                data-testid="move-target"
                sx={{
                  position: 'absolute',
                  width: '30%',
                  height: '30%',
                  borderRadius: '50%',
                  bgcolor: alpha(theme.palette.primary.main, 0.55),
                  border: `1.5px solid ${alpha(theme.palette.primary.main, 0.85)}`,
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
