import { Box, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

// Stub (T0.2). The real game screen — board, rack, drag layer, score sheet —
// is M3 (DESIGN §7.1–§7.2).
export function Game() {
  const { id } = useParams<{ id: string }>();
  return (
    <Box data-testid="game-screen" sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Game
      </Typography>
      <Typography color="text.secondary">Game id: {id}</Typography>
    </Box>
  );
}
