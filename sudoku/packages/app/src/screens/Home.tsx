// Landing: resume-first (an in-progress game is the most likely intent),
// then the daily, then a fresh game by difficulty, then quiet stats and the
// family cross-promo. No accounts, no chrome, nothing to configure.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AppShell, MoreFromUs, useColorMode } from '@parlor/brand';
import { dayKey } from '@parlor/solo';
import { DIFFICULTIES, type Difficulty } from '@sudoku/engine';
import { useNavigate } from 'react-router-dom';
import { dailyOptions, randomOptions } from '../game/session';
import { useSessionState } from '../game/useSession';
import { useApp } from '../App';

const FAMILY = [
  { name: 'Hive', tagline: 'The bug board game, online with a friend', url: 'https://hive.zackmfleischman.com', glyph: '🐝' },
  { name: 'Lex', tagline: 'A crossword tile game for two', glyph: '🅻' },
];

export function Home() {
  const { session, stats } = useApp();
  const navigate = useNavigate();
  const state = useSessionState(session);
  const { mode, toggle } = useColorMode();

  const today = dayKey(new Date());
  const inProgress = state !== null && !state.solved;
  const options = session.options;
  const summary = stats.summary(today);

  const start = (opts: ReturnType<typeof randomOptions>) => {
    session.start(opts);
    navigate('/game');
  };

  return (
    <AppShell
      title="Sudoku"
      actions={
        <IconButton aria-label="toggle color mode" onClick={toggle}>
          <Box component="span" aria-hidden sx={{ fontSize: 18, lineHeight: 1 }}>
            {mode === 'light' ? '◐' : '◑'}
          </Box>
        </IconButton>
      }
    >
      <Stack spacing={3} sx={{ mt: 2 }}>
        {inProgress && options && (
          <Card variant="outlined">
            <CardActionArea onClick={() => navigate('/game')} sx={{ p: 2 }}>
              {/* Not a heading — subtitle1 defaults to <h6> (a11y heading order). */}
              <Typography variant="subtitle1" component="p" fontWeight={600}>
                Continue
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {options.daily ? `Daily puzzle, ${options.daily}` : `${capitalize(options.difficulty)} puzzle`} in
                progress
              </Typography>
            </CardActionArea>
          </Card>
        )}

        <Button variant="contained" size="large" onClick={() => start(dailyOptions(new Date()))}>
          Daily puzzle
        </Button>

        <Box>
          <Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>
            New game
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((difficulty) => (
              <Button key={difficulty} variant="outlined" onClick={() => start(randomOptions(difficulty))}>
                {capitalize(difficulty)}
              </Button>
            ))}
          </Stack>
        </Box>

        {summary.played > 0 && (
          <Typography variant="body2" color="text.secondary">
            {summary.won} solved
            {summary.currentStreak > 1 ? ` · ${summary.currentStreak}-day streak` : ''}
            {summary.bestDurationMs !== null ? ` · best ${formatBest(summary.bestDurationMs)}` : ''}
          </Typography>
        )}

        <MoreFromUs apps={FAMILY} />
      </Stack>
    </AppShell>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatBest(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
