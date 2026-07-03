// New-game presentation (T4.7, DESIGN §6.1): color pick, expansion toggles
// (default all on), tournament-opening toggle; then the invite-link view.
// Firebase-free — sync/NewGameFlow drives it. Async time controls arrive with
// M5 (T5.5).
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Button,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { Color, GameOptions } from '@hive/engine';
import { useState } from 'react';

export type ColorChoice = Color | 'random';
export type TimeControlDays = 1 | 3 | 7 | null;

export interface NewGameChoices {
  options: GameOptions;
  color: ColorChoice;
  /** Async per-move deadline (DESIGN §5.4); null = untimed. */
  timeControlDays: TimeControlDays;
}

const DEFAULTS: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

const OPTION_LABELS: ReadonlyArray<[keyof GameOptions, string]> = [
  ['mosquito', 'Mosquito'],
  ['ladybug', 'Ladybug'],
  ['pillbug', 'Pillbug'],
  ['tournamentOpening', 'Tournament opening (no queen first)'],
];

export function NewGameForm({
  onCreate,
  busy = false,
}: {
  onCreate: (choices: NewGameChoices) => void;
  busy?: boolean;
}) {
  const [options, setOptions] = useState<GameOptions>(DEFAULTS);
  const [color, setColor] = useState<ColorChoice>('random');
  const [timeControlDays, setTimeControlDays] = useState<TimeControlDays>(3);
  return (
    <Stack spacing={3} sx={{ maxWidth: 420 }}>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Your color
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={color}
          onChange={(_, v: ColorChoice | null) => v && setColor(v)}
          fullWidth
        >
          <ToggleButton value="w" data-testid="color-w">
            White
          </ToggleButton>
          <ToggleButton value="random" data-testid="color-random">
            Random
          </ToggleButton>
          <ToggleButton value="b" data-testid="color-b">
            Black
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Stack>
        <Typography variant="overline" color="text.secondary">
          Rules
        </Typography>
        {OPTION_LABELS.map(([key, label]) => (
          <FormControlLabel
            key={key}
            control={
              <Switch
                checked={options[key]}
                onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
                data-testid={`toggle-${key}`}
              />
            }
            label={label}
          />
        ))}
      </Stack>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Time per move
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={timeControlDays === null ? 'none' : String(timeControlDays)}
          onChange={(_, v: string | null) => {
            if (v === null) return;
            setTimeControlDays(v === 'none' ? null : (Number(v) as 1 | 3 | 7));
          }}
          fullWidth
        >
          <ToggleButton value="none" data-testid="time-none">
            None
          </ToggleButton>
          <ToggleButton value="1" data-testid="time-1d">
            1 day
          </ToggleButton>
          <ToggleButton value="3" data-testid="time-3d">
            3 days
          </ToggleButton>
          <ToggleButton value="7" data-testid="time-7d">
            7 days
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Button
        variant="contained"
        size="large"
        disabled={busy}
        onClick={() => onCreate({ options, color, timeControlDays })}
        data-testid="create-game"
      >
        Create game
      </Button>
    </Stack>
  );
}

export function InviteLinkView({
  url,
  gameId,
  onOpenGame,
}: {
  url: string;
  gameId: string;
  onOpenGame: (gameId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Stack spacing={2} sx={{ maxWidth: 420 }} data-testid="invite-link-view">
      <Typography>Send your friend this invite link — the game starts when they open it:</Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          value={url}
          inputProps={{ readOnly: true, 'data-testid': 'invite-url' }}
        />
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => setCopied(true));
          }}
          data-testid="copy-invite"
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Stack>
      <Button variant="contained" onClick={() => onOpenGame(gameId)} data-testid="open-created-game">
        Open the game
      </Button>
    </Stack>
  );
}
