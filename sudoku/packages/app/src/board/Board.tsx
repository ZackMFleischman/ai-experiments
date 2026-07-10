// The 9x9 board: CSS grid, box borders drawn with per-cell edges so the grid
// stays crisp at any size. Quiet highlights — selection, same-digit echoes,
// peer wash, conflicts — carry the UX; no chrome.
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { colOf, notedDigits, rowOf, type SudokuState } from '@sudoku/engine';

export interface BoardProps {
  state: SudokuState;
  selected: number | null;
  conflicts: ReadonlySet<number>;
  onSelect: (cell: number) => void;
}

export function Board({ state, selected, conflicts, onSelect }: BoardProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const line = dark ? '#5a5a66' : '#c9c4b4';
  const heavy = theme.palette.text.primary;
  const selectedDigit = selected !== null ? (state.grid[selected] as number) : 0;

  return (
    <Box
      role="grid"
      aria-label="sudoku board"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        aspectRatio: '1',
        width: '100%',
        maxWidth: 500,
        mx: 'auto',
        border: 2,
        borderColor: heavy,
        borderRadius: 1,
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      {Array.from({ length: 81 }, (_, cell) => {
        const value = state.grid[cell] as number;
        const given = (state.puzzle[cell] as number) !== 0;
        const row = rowOf(cell);
        const col = colOf(cell);
        const isSelected = cell === selected;
        const sameDigit = value !== 0 && value === selectedDigit && !isSelected;
        const peerWash =
          selected !== null &&
          !isSelected &&
          (row === rowOf(selected) || col === colOf(selected));
        const conflict = conflicts.has(cell);

        const background = isSelected
          ? theme.palette.primary.main + (dark ? '55' : '33')
          : sameDigit
            ? theme.palette.primary.main + (dark ? '38' : '22')
            : peerWash
              ? theme.palette.action.hover
              : 'transparent';

        return (
          <Box
            key={cell}
            role="gridcell"
            aria-label={`r${row + 1}c${col + 1}${value ? ` ${value}` : ''}`}
            aria-selected={isSelected}
            onPointerDown={() => onSelect(cell)}
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background,
              borderRight: col === 8 ? 0 : col % 3 === 2 ? `2px solid ${heavy}` : `1px solid ${line}`,
              borderBottom: row === 8 ? 0 : row % 3 === 2 ? `2px solid ${heavy}` : `1px solid ${line}`,
              fontSize: 'clamp(16px, 4.5vmin, 28px)',
              fontWeight: given ? 700 : 400,
              color: conflict
                ? theme.palette.error.main
                : given
                  ? theme.palette.text.primary
                  : theme.palette.primary.main,
            }}
          >
            {value !== 0 ? (
              value
            ) : (
              <Notes mask={state.notes[cell] as number} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function Notes({ mask }: { mask: number }) {
  if (mask === 0) return null;
  const digits = new Set(notedDigits(mask));
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: '4%',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        fontSize: 'clamp(7px, 1.7vmin, 11px)',
        fontWeight: 500,
        color: 'text.secondary',
        lineHeight: 1,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {digits.has(i + 1) ? i + 1 : ''}
        </Box>
      ))}
    </Box>
  );
}
