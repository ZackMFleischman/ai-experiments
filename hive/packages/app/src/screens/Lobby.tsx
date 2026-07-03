import AddIcon from '@mui/icons-material/Add';
import { Box, Button, Fab, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export function Lobby() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" component="h1">
        Your games
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Hot-seat play: two players, one device. Multiplayer arrives with M4.
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
