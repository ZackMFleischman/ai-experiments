import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export function Landing() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h2" component="h1" fontWeight={700} letterSpacing="0.2em">
          HIVE
        </Typography>
        <Typography color="text.secondary">Two players. One hive. Don&apos;t get surrounded.</Typography>
        <Button component={RouterLink} to="/lobby" variant="contained" size="large">
          Play
        </Button>
      </Stack>
    </Box>
  );
}
