import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

// Stub (T0.2). The themed hero — a board vignette spelling the wordmark from
// real tile components — lands with T4.2 (DESIGN §7.1).
export function Landing() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack spacing={3} alignItems="center">
        <Typography variant="h2" component="h1" fontWeight={700}>
          LEX
        </Typography>
        <Typography color="text.secondary">A crossword tile game for two.</Typography>
        <Stack direction="row" spacing={2}>
          <Button component={RouterLink} to="/game/local" variant="contained">
            Play hot-seat
          </Button>
          <Button component={RouterLink} to="/lobby" variant="outlined">
            Your games
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
