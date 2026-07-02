import { Box, Typography } from '@mui/material';

export function NewGame() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" component="h1">
        New game
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Game setup arrives with the local game UI (M3).
      </Typography>
    </Box>
  );
}
