// New game: the full-mode create flow (callable + invite link). checkers's form
// is small — pick a side (attackers open) and an optional move clock; a past
// opponent can be challenged directly. The static hot-seat build keeps all
// of it out of the bundle.
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { Friend } from '@parlor/web/lobby-ui';
import { lazy, Suspense, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { DEFAULT_OPTIONS, type SeatChoice, type CheckersGameOptions } from '../gameOptions';

const NewGameFlow =
  import.meta.env.VITE_CHECKERS_MODE === 'full' ? lazy(() => import('../sync/NewGameFlow')) : null;

export interface NewGameChoices {
  options: CheckersGameOptions;
  seat: SeatChoice;
  opponent: Friend | null;
}

const CLOCKS: ReadonlyArray<{ label: string; value: CheckersGameOptions['timeControl'] }> = [
  { label: 'No clock', value: null },
  { label: '1 day/move', value: { days: 1 } },
  { label: '3 days/move', value: { days: 3 } },
  { label: '7 days/move', value: { days: 7 } },
];

export function NewGameForm({
  onCreate,
  busy,
  friends,
}: {
  onCreate: (choices: NewGameChoices) => void;
  busy: boolean;
  friends: readonly Friend[];
}) {
  const [seat, setSeat] = useState<SeatChoice>('random');
  const [clock, setClock] = useState(0);
  const [opponentUid, setOpponentUid] = useState('');

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      <Box>
        <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
          Your side
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={seat}
          onChange={(_, next: SeatChoice | null) => next && setSeat(next)}
          aria-label="your side"
          size="small"
        >
          <ToggleButton value="attackers">Attackers</ToggleButton>
          <ToggleButton value="defenders">Defenders</ToggleButton>
          <ToggleButton value="random">Random</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Attackers move first; the defenders hold the king.
        </Typography>
      </Box>

      <Box>
        <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
          Move clock
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {CLOCKS.map((option, index) => (
            <Chip
              key={option.label}
              label={option.label}
              color={clock === index ? 'primary' : 'default'}
              onClick={() => setClock(index)}
            />
          ))}
        </Stack>
      </Box>

      {friends.length > 0 && (
        <TextField
          select
          label="Opponent"
          value={opponentUid}
          onChange={(e) => setOpponentUid(e.target.value)}
          helperText="Pick a past opponent to challenge directly, or leave open for an invite link."
        >
          <MenuItem value="">Open invite (share a link)</MenuItem>
          {friends.map((friend) => (
            <MenuItem key={friend.uid} value={friend.uid}>
              {friend.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      <Button
        variant="contained"
        size="large"
        disabled={busy}
        onClick={() =>
          onCreate({
            options: { ...DEFAULT_OPTIONS, timeControl: CLOCKS[clock]?.value ?? null },
            seat,
            opponent: friends.find((f) => f.uid === opponentUid) ?? null,
          })
        }
        data-testid="create-game"
      >
        {opponentUid ? 'Send challenge' : 'Create game'}
      </Button>
    </Stack>
  );
}

export function NewGame() {
  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={RouterLink} to="/lobby" aria-label="back to lobby" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1">
          New game
        </Typography>
      </Stack>
      {NewGameFlow ? (
        <Suspense fallback={null}>
          <NewGameFlow />
        </Suspense>
      ) : (
        <Typography color="text.secondary">
          Online games live in the multiplayer app — hot-seat starts straight from the lobby.
        </Typography>
      )}
    </Box>
  );
}
