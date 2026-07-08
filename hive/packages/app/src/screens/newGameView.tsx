// New-game presentation (T4.7, DESIGN §6.1): opponent pick (invite link or a
// past opponent to challenge directly), color pick, expansion toggles
// (default all on), tournament-opening toggle; then the invite-link view. The
// color + expansion controls are hive-specific so the form stays game-side —
// only the friends helper and the invite-link view come from
// @parlor/web/lobby-ui. Firebase-free — sync/NewGameFlow drives it.
import {
  Button,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { Color, GameOptions } from '@hive/engine';
import { friendsFrom, InviteLinkView, type Friend } from '@parlor/web/lobby-ui';
import { useState } from 'react';

// The invite-link view and the friends helper are shared platform pieces.
export { friendsFrom, InviteLinkView, type Friend };

export type ColorChoice = Color | 'random';
export type TimeControlDays = 1 | 3 | 7 | null;

export interface NewGameChoices {
  options: GameOptions;
  color: ColorChoice;
  /** Async per-move deadline (DESIGN §5.4); null = untimed. */
  timeControlDays: TimeControlDays;
  /** Direct challenge target; null = open game with an invite link. */
  opponent: Friend | null;
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
  friends = [],
}: {
  onCreate: (choices: NewGameChoices) => void;
  busy?: boolean;
  /** Past opponents, most recent first — offered as direct-challenge targets. */
  friends?: Friend[];
}) {
  const [options, setOptions] = useState<GameOptions>(DEFAULTS);
  const [color, setColor] = useState<ColorChoice>('random');
  const [timeControlDays, setTimeControlDays] = useState<TimeControlDays>(3);
  const [opponent, setOpponent] = useState<Friend | null>(null);
  return (
    <Stack spacing={3} sx={{ maxWidth: 420 }}>
      {friends.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            Opponent
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              label="Invite link"
              color={opponent === null ? 'primary' : 'default'}
              variant={opponent === null ? 'filled' : 'outlined'}
              onClick={() => setOpponent(null)}
              data-testid="opponent-link"
            />
            {friends.map((f) => (
              <Chip
                key={f.uid}
                label={f.name}
                color={opponent?.uid === f.uid ? 'primary' : 'default'}
                variant={opponent?.uid === f.uid ? 'filled' : 'outlined'}
                onClick={() => setOpponent(f)}
                data-testid={`opponent-${f.uid}`}
              />
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {opponent
              ? `${opponent.name} gets the challenge right in their lobby — no code needed.`
              : 'Anyone with the link or code can take the open seat.'}
          </Typography>
        </Stack>
      )}
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
        onClick={() => onCreate({ options, color, timeControlDays, opponent })}
        data-testid="create-game"
      >
        {opponent ? `Challenge ${opponent.name}` : 'Create game'}
      </Button>
    </Stack>
  );
}
