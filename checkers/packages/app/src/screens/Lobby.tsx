// Lobby: signed-in identity + sign-out in full mode; the grouped game list
// is the lazy full-mode container (sync/OnlineGames) so the static hot-seat
// bundle stays firebase-free. checkers keeps sign-out inline (no Settings
// screen — there is nothing else to set; the theme toggle lives on Home
// surfaces via the brand shell).
import AddIcon from '@mui/icons-material/Add';
import LogoutIcon from '@mui/icons-material/Logout';
import { Avatar, Box, Button, Chip, Fab, IconButton, Stack, Typography } from '@mui/material';
import { useAuth } from '@parlor/web';
import { JoinByCodeButton } from '@parlor/web/lobby-ui';
import { lazy, Suspense } from 'react';
import { Link as RouterLink } from 'react-router-dom';

// Full mode only: the firestore-backed games list (kept out of the static bundle).
const OnlineGames =
  import.meta.env.VITE_CHECKERS_MODE === 'full' ? lazy(() => import('../sync/OnlineGames')) : null;

export function Lobby() {
  const auth = useAuth();
  return (
    <Box sx={{ p: 3, pb: 12 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography variant="h5" component="h1" noWrap>
          Your games
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          {auth.mode === 'full' && auth.user && (
            <Chip
              avatar={<Avatar {...(auth.user.photoURL ? { src: auth.user.photoURL } : {})} />}
              label={auth.user.displayName ?? auth.user.email ?? 'Player'}
              sx={{ maxWidth: 160 }}
              data-testid="lobby-user"
            />
          )}
          {auth.mode === 'full' && (
            <IconButton aria-label="sign out" onClick={() => void auth.signOut()} data-testid="lobby-signout">
              <LogoutIcon />
            </IconButton>
          )}
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
        variant="extended"
        aria-label="New game"
        sx={{ position: 'fixed', right: 24, bottom: 24 }}
      >
        <AddIcon sx={{ mr: 1 }} />
        New game
      </Fab>
    </Box>
  );
}
