// Lobby-card thumbnail + landing hero: a tiny static render of a board
// string (the game doc's serialized state renders without replaying the
// log). Pure presentation, no interaction — surfaces read the accent-derived
// board tokens (DESIGN-PRINCIPLES §3); piece ink/bone match Board's fixed
// side-identity colors.
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import { BOARD_SIZE, THRONE, CORNERS } from '@tafl/engine';

export function MiniBoard({ board, size = 72 }: { board: string; size?: number }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const restricted = new Set<number>([THRONE, ...CORNERS]);
  const ink = dark ? '#2e2528' : '#3b2e31';
  const bone = dark ? '#e8e2d4' : '#f7f3e8';
  return (
    <Box
      aria-hidden
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        width: size,
        height: size,
        border: 1,
        borderColor: alpha(theme.palette.text.primary, dark ? 0.4 : 0.5),
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: theme.palette.board.surface,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, cell) => {
        const piece = board[cell] ?? '.';
        return (
          <Box
            key={cell}
            sx={{
              position: 'relative',
              display: 'grid',
              placeItems: 'center',
              boxShadow: `inset 0 0 0 0.5px ${theme.palette.board.cell}`,
              bgcolor: restricted.has(cell)
                ? alpha(theme.palette.primary.main, dark ? 0.12 : 0.1)
                : 'transparent',
            }}
          >
            {piece !== '.' && (
              <Box
                sx={{
                  width: '78%',
                  height: '78%',
                  borderRadius: piece === 'A' ? '28%' : '50%',
                  transform: piece === 'A' ? 'rotate(45deg) scale(0.88)' : 'none',
                  bgcolor: piece === 'K' ? theme.palette.primary.main : piece === 'A' ? ink : bone,
                  border: piece === 'D' ? 1 : 0,
                  borderColor: alpha(ink, 0.85),
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
