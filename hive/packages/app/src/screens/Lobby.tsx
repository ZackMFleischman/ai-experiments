import AddIcon from '@mui/icons-material/Add';
import { Avatar, Box, Button, Chip, Fab, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../sync/authContext';

/** Lobby (T4.1): signed-in identity + sign-out in full mode. The real game
 * list (your-turn/waiting groups, thumbnails) lands with T4.7. */
export function Lobby() {
  const auth = useAuth();
  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" component="h1">
          Your games
        </Typography>
        {auth.mode === 'full' && auth.user && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              avatar={<Avatar {...(auth.user.photoURL ? { src: auth.user.photoURL } : {})} />}
              label={auth.user.displayName ?? auth.user.email ?? 'Player'}
              data-testid="lobby-user"
            />
            <Button size="small" onClick={() => void auth.signOut()} data-testid="sign-out">
              Sign out
            </Button>
          </Stack>
        )}
      </Stack>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Hot-seat play: two players, one device. Online games arrive as M4 builds out.
      </Typography>
      <Button component={RouterLink} to="/game/local" variant="contained" sx={{ mt: 2 }}>
        Play hot-seat
      </Button>
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
