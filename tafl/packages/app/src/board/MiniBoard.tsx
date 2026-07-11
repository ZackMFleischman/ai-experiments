// Lobby-card thumbnail + landing hero: a tiny static render of a board
// string (the game doc's serialized state renders without replaying the
// log). Pure presentation, no interaction.
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import { BOARD_SIZE, THRONE, CORNERS } from '@tafl/engine';

export function MiniBoard({ board, size = 72 }: { board: string; size?: number }) {
  const theme = useTheme();
  const restricted = new Set<number>([THRONE, ...CORNERS]);
  return (
    <Box
      aria-hidden
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        width: size,
        height: size,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: theme.palette.board.surface,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, cell) => {
        const piece = board[cell] ?? '.';
        return (
          <Box key={cell} sx={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            {piece === '.' && restricted.has(cell) && (
              <Box
                sx={{
                  width: '45%',
                  height: '45%',
                  borderRadius: cell === THRONE ? '50%' : '25%',
                  border: 1,
                  borderColor: alpha(theme.palette.text.primary, 0.3),
                }}
              />
            )}
            {piece !== '.' && (
              <Box
                sx={{
                  width: '72%',
                  height: '72%',
                  borderRadius: piece === 'A' ? '25%' : '50%',
                  transform: piece === 'A' ? 'rotate(45deg) scale(0.9)' : 'none',
                  bgcolor:
                    piece === 'K'
                      ? theme.palette.primary.main
                      : piece === 'A'
                        ? theme.palette.text.primary
                        : theme.palette.background.paper,
                  border: piece === 'D' ? 1 : 0,
                  borderColor: theme.palette.text.primary,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
