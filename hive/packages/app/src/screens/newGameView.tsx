// New-game presentation (T4.7, DESIGN §6.1): opponent pick (invite link or a
// past opponent to challenge directly), color pick, expansion toggles
// (default all on), tournament-opening toggle; then the invite-link view.
// Firebase-free — sync/NewGameFlow drives it. Async time controls arrive with
// M5 (T5.5).
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
import { useState } from 'react';
import { InviteShare } from './waitingView';

export type ColorChoice = Color | 'random';
export type TimeControlDays = 1 | 3 | 7 | null;

/** A past opponent, challengeable without a code (DESIGN §5.3). */
export interface Friend {
  uid: string;
  name: string;
}

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

/** Distinct past opponents, most recent first — the challenge targets. */
export function friendsFrom(
  games: ReadonlyArray<{ opponentUid?: string; opponentName: string | null; updatedAtMs: number }>,
): Friend[] {
  const seen = new Map<string, Friend>();
  for (const g of [...games].sort((a, b) => b.updatedAtMs - a.updatedAtMs)) {
    if (!g.opponentUid || !g.opponentName || seen.has(g.opponentUid)) continue;
    seen.set(g.opponentUid, { uid: g.opponentUid, name: g.opponentName });
  }
  return [...seen.values()];
}

export function InviteLinkView({
  code,
  gameId,
  onOpenGame,
}: {
  code: string;
  gameId: string;
  onOpenGame: (gameId: string) => void;
}) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 420 }} data-testid="invite-link-view">
      <Typography>
        Send your friend this invite — the game starts when they accept. The link and code stay
        available on the game screen while you wait.
      </Typography>
      <InviteShare code={code} />
      <Button variant="contained" onClick={() => onOpenGame(gameId)} data-testid="open-created-game">
        Open the game
      </Button>
    </Stack>
  );
}
