import { Box, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

export function Game() {
  const { id } = useParams<{ id: string }>();
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" component="h1">
        Game
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Board for game {id ?? '—'} arrives with M3.
      </Typography>
    </Box>
  );
}
