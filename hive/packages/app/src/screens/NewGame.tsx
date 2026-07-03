import { Box, Typography } from '@mui/material';
import { lazy, Suspense } from 'react';

// Full mode only: create-game flow (callable + invite link). The static
// hot-seat build keeps this out of the bundle.
const NewGameFlow =
  import.meta.env.VITE_HIVE_MODE === 'full' ? lazy(() => import('../sync/NewGameFlow')) : null;

export function NewGame() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        New game
      </Typography>
      {NewGameFlow ? (
        <Suspense fallback={null}>
          <NewGameFlow />
        </Suspense>
      ) : (
        <Typography color="text.secondary">
          Online games live in the multiplayer app — hot-seat starts straight from the lobby.
        </Typography>
      )}
    </Box>
  );
}
