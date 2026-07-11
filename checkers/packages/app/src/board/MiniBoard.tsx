// Lobby-card thumbnail + landing hero: a tiny static render of a board
// string (the game doc's serialized state renders without replaying the
// log). Pure presentation, no interaction.
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import { BOARD_SIZE } from '@checkers/engine';

export function MiniBoard({ board, size = 72 }: { board: string; size?: number }) {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const paper = theme.palette.background.paper;
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
        bgcolor: theme.palette.mode === 'dark' ? '#1b1b1f' : '#efece3',
        flexShrink: 0,
      }}
    >
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, cell) => {
        const piece = board[cell] ?? '.';
        const row = Math.floor(cell / BOARD_SIZE);
        const col = cell % BOARD_SIZE;
        const playable = (row + col) % 2 === 1;
        const dark = piece === 'd' || piece === 'D';
        const king = piece === 'D' || piece === 'L';
        return (
          <Box
            key={cell}
            sx={{
              position: 'relative',
              display: 'grid',
              placeItems: 'center',
              bgcolor: playable ? alpha(ink, 0.14) : 'transparent',
            }}
          >
            {piece !== '.' && (
              <Box
                sx={{
                  width: '72%',
                  height: '72%',
                  borderRadius: '50%',
                  bgcolor: dark ? ink : paper,
                  border: 1,
                  borderColor: ink,
                  boxSizing: 'border-box',
                }}
              >
                {king && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: '38%',
                      borderRadius: '50%',
                      bgcolor: theme.palette.primary.main,
                    }}
                  />
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
