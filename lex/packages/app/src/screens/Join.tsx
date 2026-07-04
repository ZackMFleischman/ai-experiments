import { Box, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

// Stub (T0.2). The game-summary card (board, dictionary, time control, seat —
// FR-10) lands with T4.7 (DESIGN §7.1).
export function Join() {
  const { code } = useParams<{ code: string }>();
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Join game
      </Typography>
      <Typography color="text.secondary">Invite code: {code}</Typography>
    </Box>
  );
}
