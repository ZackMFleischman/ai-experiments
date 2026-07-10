// Landing: pick a length, sit. Then quiet stats and the family cross-promo.
// No accounts, no chrome, nothing to configure — the app is a bell and a
// clock, and it should feel that way.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AppShell, MoreFromUs, useColorMode } from '@parlor/brand';
import { dayKey } from '@parlor/solo';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../App';

const FAMILY = [
  { name: 'Sudoku', tagline: 'A calm daily puzzle', url: 'https://sudoku-zmf.pages.dev', glyph: '🔢' },
  { name: 'Hive', tagline: 'The bug board game, online with a friend', url: 'https://hive.zackmfleischman.com', glyph: '🐝' },
  { name: 'Lex', tagline: 'A crossword tile game for two', glyph: '🅻' },
];

const PRESETS = [5, 10, 15, 20];

export function Home() {
  const { stats } = useApp();
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();
  const [custom, setCustom] = useState(30);

  const summary = stats.summary(dayKey(new Date()));
  const sit = (minutes: number) => navigate(`/sit?m=${minutes}`);

  return (
    <AppShell
      title="Stillness"
      actions={
        <IconButton aria-label="toggle color mode" onClick={toggle}>
          <Box component="span" aria-hidden sx={{ fontSize: 18, lineHeight: 1 }}>
            {mode === 'light' ? '◐' : '◑'}
          </Box>
        </IconButton>
      }
    >
      <Stack spacing={3} sx={{ mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Choose a length. A bell ends the sit.
        </Typography>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {PRESETS.map((minutes) => (
            <Button key={minutes} variant="contained" size="large" onClick={() => sit(minutes)}>
              {minutes} min
            </Button>
          ))}
        </Stack>

        <Box>
          <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
            Longer
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Slider
              aria-label="custom minutes"
              min={1}
              max={90}
              value={custom}
              onChange={(_, v) => setCustom(v as number)}
              sx={{ maxWidth: 260 }}
            />
            <Button variant="outlined" onClick={() => sit(custom)} sx={{ whiteSpace: 'nowrap' }}>
              {custom} min
            </Button>
          </Stack>
        </Box>

        {summary.played > 0 && (
          <Typography variant="body2" color="text.secondary">
            {summary.played} {summary.played === 1 ? 'sit' : 'sits'}
            {summary.currentStreak > 1 ? ` · ${summary.currentStreak}-day streak` : ''}
          </Typography>
        )}

        <MoreFromUs apps={FAMILY} />
      </Stack>
    </AppShell>
  );
}
