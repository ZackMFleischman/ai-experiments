// ported from hive/packages/app/src/screens/NewGame.tsx (adapted)
// New game (T4.7): the full-mode create flow (callable + invite link). The
// static hot-seat build keeps this out of the bundle.
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, IconButton, Stack, Typography } from '@mui/material';
import { lazy, Suspense } from 'react';
import { Link as RouterLink } from 'react-router-dom';

const NewGameFlow =
  import.meta.env.VITE_LEX_MODE === 'full' ? lazy(() => import('../sync/NewGameFlow')) : null;

export function NewGame() {
  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={RouterLink} to="/lobby" aria-label="back to lobby" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1">
          New game
        </Typography>
      </Stack>
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
