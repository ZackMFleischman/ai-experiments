import { Box, Typography } from '@mui/material';

// Stub (T0.2). Notifications, theme, and tile-skin settings land with
// T5.2 / T6.1 (DESIGN §7.1).
export function Settings() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Settings
      </Typography>
    </Box>
  );
}
