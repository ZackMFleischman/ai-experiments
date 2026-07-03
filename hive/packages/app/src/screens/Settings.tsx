import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, FormControlLabel, IconButton, Stack, Switch, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { usePieceArt } from '../board/pieceArt';
import { useColorMode } from '../theme';

export function Settings() {
  const { mode, toggle } = useColorMode();
  const art = usePieceArt();
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
      <FormControlLabel
        sx={{ mt: 2, display: 'flex' }}
        control={<Switch checked={art.bearMode} onChange={art.toggle} />}
        label="Bear mode"
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 6 }}>
        Play with the 8 bear species instead of bugs — same pieces, same rules.
      </Typography>
    </Box>
  );
}
