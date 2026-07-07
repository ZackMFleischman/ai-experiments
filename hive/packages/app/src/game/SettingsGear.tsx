// In-game settings gear: a popover holding the display/UX toggles that belong
// to a live game — Bear mode (piece reskin) and Confirm move (stage-then-send).
// Neither touches the engine; both persist across sessions via their contexts.
import SettingsIcon from '@mui/icons-material/Settings';
import {
  FormControlLabel,
  IconButton,
  Popover,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { usePieceArt } from '../board/pieceArt';
import { useGameSettings } from './gameSettings';

export function SettingsGear() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const art = usePieceArt();
  const { confirmMove, toggleConfirmMove } = useGameSettings();

  return (
    <>
      <IconButton
        aria-label="settings"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <SettingsIcon fontSize="small" />
      </IconButton>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack sx={{ p: 2, minWidth: 240 }} spacing={1.5}>
          <Typography variant="h6" component="h2">
            Settings
          </Typography>
          <div>
            <FormControlLabel
              sx={{ display: 'flex', m: 0, justifyContent: 'space-between' }}
              labelPlacement="start"
              control={
                <Switch
                  checked={art.bearMode}
                  onChange={art.toggle}
                  inputProps={{ 'aria-label': 'Bear mode' }}
                />
              }
              label="Bear mode"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Play with the 8 bear species instead of bugs — same pieces, same rules.
            </Typography>
          </div>
          <div>
            <FormControlLabel
              sx={{ display: 'flex', m: 0, justifyContent: 'space-between' }}
              labelPlacement="start"
              control={
                <Switch
                  checked={confirmMove}
                  onChange={toggleConfirmMove}
                  inputProps={{ 'aria-label': 'Confirm move' }}
                />
              }
              label="Confirm move"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Stage your move first, then tap Confirm to submit it.
            </Typography>
          </div>
        </Stack>
      </Popover>
    </>
  );
}
