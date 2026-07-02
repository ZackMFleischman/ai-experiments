import { Box, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

export function Join() {
  const { code } = useParams<{ code: string }>();
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" component="h1">
        Join game
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Invite code: {code ?? '—'} (multiplayer arrives with M4)
      </Typography>
    </Box>
  );
}
