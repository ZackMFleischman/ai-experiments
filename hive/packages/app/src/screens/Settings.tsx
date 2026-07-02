import { Box, FormControlLabel, Switch, Typography } from '@mui/material';
import { useColorMode } from '../theme';

export function Settings() {
  const { mode, toggle } = useColorMode();
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" component="h1">
        Settings
      </Typography>
      <FormControlLabel
        sx={{ mt: 2 }}
        control={<Switch checked={mode === 'dark'} onChange={toggle} />}
        label="Dark mode"
      />
    </Box>
  );
}
