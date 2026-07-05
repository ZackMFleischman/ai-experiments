// ported from hive/packages/app/src/screens/Lobby.tsx (adapted)
// Lobby (T4.7): signed-in identity + sign-out in full mode; the grouped game
// list is the lazy full-mode container (sync/OnlineGames) so the static
// hot-seat bundle stays firebase-free.
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import { Avatar, Box, Button, Chip, Fab, IconButton, Stack, Typography } from '@mui/material';
import { useAuth } from '@parlor/web';
import { lazy, Suspense } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { JoinByCodeButton } from './JoinByCode';

// Full mode only: the firestore-backed games list (kept out of the static bundle).
const OnlineGames =
  import.meta.env.VITE_LEX_MODE === 'full' ? lazy(() => import('../sync/OnlineGames')) : null;

export function Lobby() {
  const auth = useAuth();
  return (
    <Box sx={{ p: 3, pb: 12 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" component="h1">
          Your games
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {auth.mode === 'full' && auth.user && (
            <>
              <Chip
                avatar={<Avatar {...(auth.user.photoURL ? { src: auth.user.photoURL } : {})} />}
                label={auth.user.displayName ?? auth.user.email ?? 'Player'}
                data-testid="lobby-user"
              />
              <Button size="small" onClick={() => void auth.signOut()} data-testid="sign-out">
                Sign out
              </Button>
            </>
          )}
          <IconButton
            component={RouterLink}
            to="/settings"
            aria-label="settings"
            data-testid="lobby-settings"
          >
            <SettingsIcon />
          </IconButton>
        </Stack>
      </Stack>
      {OnlineGames ? (
        <Suspense fallback={null}>
          <OnlineGames />
        </Suspense>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Hot-seat play: two players, one device.
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        <Button
          component={RouterLink}
          to="/game/local"
          variant={OnlineGames ? 'outlined' : 'contained'}
        >
          Play hot-seat
        </Button>
        {OnlineGames && <JoinByCodeButton />}
      </Stack>
      <Fab
        component={RouterLink}
        to="/new"
        color="primary"
        aria-label="New game"
        sx={{ position: 'fixed', right: 24, bottom: 24 }}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
