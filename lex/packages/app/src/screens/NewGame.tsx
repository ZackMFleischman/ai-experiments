import { Box, Typography } from '@mui/material';

// Stub (T0.2). Opponent chip / invite link, board + dictionary pickers,
// turn order, time control land with T4.7 (DESIGN §7.1, FR-6..9).
export function NewGame() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        New game
      </Typography>
    </Box>
  );
}
