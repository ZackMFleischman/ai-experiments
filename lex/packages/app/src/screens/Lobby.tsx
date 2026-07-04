import { Box, Typography } from '@mui/material';

// Stub (T0.2). Grouped games (challenges / your-turn / waiting / finished)
// land with T4.7 (DESIGN §7.1).
export function Lobby() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Your games
      </Typography>
    </Box>
  );
}
