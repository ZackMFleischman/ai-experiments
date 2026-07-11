// Landing: one big Play button (the game is the point), quiet high scores,
// and the family cross-promo. No accounts, no chrome, nothing to configure.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AppShell, MoreFromUs, useColorMode } from '@parlor/brand';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../App';

const FAMILY = [
  { name: 'Sudoku', tagline: 'A calm daily puzzle', url: 'https://sudoku-zmf.pages.dev', glyph: '🔢' },
  { name: 'Stillness', tagline: 'A quiet meditation timer', url: 'https://stillness-zmf.pages.dev', glyph: '🧘' },
  { name: 'Hive', tagline: 'The bug board game, online with a friend', url: 'https://hive.zackmfleischman.com', glyph: '🐝' },
];

export function Home() {
  const { scores } = useApp();
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();

  const top = scores.top(5);
  const played = scores.scores().length;

  return (
    <AppShell
      title="Bricks"
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
          The wall, the paddle, the ball. Drag or use the arrow keys; tap to
          serve.
        </Typography>

        <Button variant="contained" size="large" onClick={() => navigate('/play')}>
          Play
        </Button>

        {top.length > 0 && (
          <Box>
            <Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>
              Best runs
            </Typography>
            <Stack spacing={0.5} component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {top.map((record, i) => (
                <Typography
                  key={`${record.day}-${record.score}-${i}`}
                  component="li"
                  variant="body2"
                  color={i === 0 ? 'text.primary' : 'text.secondary'}
                  fontWeight={i === 0 ? 600 : 400}
                >
                  {record.score} · {record.day}
                </Typography>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {played} {played === 1 ? 'game' : 'games'} played
            </Typography>
          </Box>
        )}
      </Stack>

      {/* Direct child of the shell's flex column so mt:auto sinks it. */}
      <MoreFromUs apps={FAMILY} />
    </AppShell>
  );
}
