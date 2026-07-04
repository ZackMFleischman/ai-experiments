// Blank letter-picker sheet (T3.6): opens when a staged blank awaits its
// designation. Letters come from the ruleset's tile set — never hard-coded.
import { Box, Drawer, Typography } from '@mui/material';
import type { Letter, TileSet } from '@lex/engine';

export interface BlankPickerProps {
  open: boolean;
  tiles: TileSet;
  onPick: (letter: Letter) => void;
}

export function BlankPicker({ open, tiles, onPick }: BlankPickerProps) {
  const letters = Object.keys(tiles.counts)
    .filter((face) => face !== '?')
    .sort() as Letter[];
  return (
    <Drawer anchor="bottom" open={open}>
      <Box sx={{ p: 2, pb: 3 }} data-testid="blank-picker">
        <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
          Choose a letter for the blank
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 0.75 }}>
          {letters.map((letter) => (
            <Box
              key={letter}
              component="button"
              aria-label={letter}
              onClick={() => onPick(letter)}
              sx={{
                height: 44,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                bgcolor: 'background.paper',
                color: 'text.primary',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {letter}
            </Box>
          ))}
        </Box>
      </Box>
    </Drawer>
  );
}
