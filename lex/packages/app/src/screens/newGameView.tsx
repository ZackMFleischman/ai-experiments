// ported from hive/packages/app/src/screens/newGameView.tsx (adapted)
// New-game presentation (T4.7, DESIGN §7.1, FR-6..9): opponent pick (invite
// link or a past opponent to challenge directly), BOARD picker with a mini
// premium-map preview, DICTIONARY picker labeled with word counts, turn
// order, async time control; then the invite-link view. Firebase-free —
// sync/NewGameFlow drives it.
import {
  Button,
  Card,
  CardActionArea,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { RULESETS } from '@lex/engine';
import { DICTIONARIES } from '@lex/dict';
import { friendsFrom, InviteLinkView, type Friend } from '@parlor/web/lobby-ui';
import { useState } from 'react';
import { MiniBoard } from '../board/MiniBoard';
import {
  boardName,
  type LexGameOptions,
  type SeatChoice,
  type TimeControlDays,
} from '../gameOptions';

// The invite-link view and the friends helper are shared platform pieces.
export { friendsFrom, InviteLinkView, type Friend };

export interface NewGameChoices {
  options: LexGameOptions;
  seat: SeatChoice;
  /** Direct challenge target; null = open game with an invite link. */
  opponent: Friend | null;
}

const DEFAULT_BOARD = 'classic';
const DEFAULT_DICTIONARY = 'nwl2023'; // the official North American tournament list
const DEFAULT_DAYS: TimeControlDays = 3;

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
  const [rulesetId, setRulesetId] = useState(DEFAULT_BOARD);
  const [dictionaryId, setDictionaryId] = useState(DEFAULT_DICTIONARY);
  const [seat, setSeat] = useState<SeatChoice>('random');
  const [days, setDays] = useState<TimeControlDays>(DEFAULT_DAYS);
  const [opponent, setOpponent] = useState<Friend | null>(null);
  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
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
          Board
        </Typography>
        <Stack direction="row" spacing={1.5}>
          {Object.keys(RULESETS).map((id) => (
            <Card
              key={id}
              variant="outlined"
              sx={{
                flex: 1,
                borderColor: rulesetId === id ? 'primary.main' : 'divider',
                borderWidth: rulesetId === id ? 2 : 1,
              }}
            >
              <CardActionArea
                onClick={() => setRulesetId(id)}
                data-testid={`board-${id}`}
                aria-pressed={rulesetId === id}
                sx={{ p: 1.25 }}
              >
                <Stack spacing={1} alignItems="center">
                  <MiniBoard rulesetId={id} size={96} />
                  <Typography variant="body2" fontWeight={600}>
                    {boardName(id)}
                  </Typography>
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      </Stack>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Dictionary
        </Typography>
        <Stack spacing={1}>
          {DICTIONARIES.map((d) => (
            <Card
              key={d.id}
              variant="outlined"
              sx={{
                borderColor: dictionaryId === d.id ? 'primary.main' : 'divider',
                borderWidth: dictionaryId === d.id ? 2 : 1,
              }}
            >
              <CardActionArea
                onClick={() => setDictionaryId(d.id)}
                data-testid={`dictionary-${d.id}`}
                aria-pressed={dictionaryId === d.id}
                sx={{ p: 1.25 }}
              >
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography fontWeight={600}>{d.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {Math.round(d.wordCount / 1000)}k words
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {d.description}
                </Typography>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      </Stack>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Who goes first
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={seat}
          onChange={(_, v: SeatChoice | null) => v && setSeat(v)}
          fullWidth
        >
          <ToggleButton value="me" data-testid="seat-me">
            You
          </ToggleButton>
          <ToggleButton value="random" data-testid="seat-random">
            Random
          </ToggleButton>
          <ToggleButton value="them" data-testid="seat-them">
            They do
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Time per move
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={days === null ? 'none' : String(days)}
          onChange={(_, v: string | null) => {
            if (v === null) return;
            setDays(v === 'none' ? null : (Number(v) as 1 | 3 | 7));
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
        onClick={() =>
          onCreate({
            options: { rulesetId, dictionaryId, timeControl: days === null ? null : { days } },
            seat,
            opponent,
          })
        }
        data-testid="create-game"
      >
        {opponent ? `Challenge ${opponent.name}` : 'Create game'}
      </Button>
    </Stack>
  );
}

