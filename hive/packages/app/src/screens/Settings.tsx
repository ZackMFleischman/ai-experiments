import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, FormControlLabel, IconButton, Stack, Switch, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useColorMode } from '../theme';

export function Settings() {
  const { mode, toggle } = useColorMode();
  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton component={RouterLink} to="/lobby" aria-label="back to lobby" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1">
          Settings
        </Typography>
      </Stack>
      <FormControlLabel
        sx={{ mt: 2 }}
        control={<Switch checked={mode === 'dark'} onChange={toggle} />}
        label="Dark mode"
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Bear mode and Confirm move now live on the settings gear inside a game.
      </Typography>
    </Box>
  );
}
