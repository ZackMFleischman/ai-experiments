// ported from hive/packages/app/src/screens/newGameView.tsx (adapted)
// New-game presentation (T4.7, DESIGN §7.1, FR-6..9b): opponent pick (invite
// link or a past opponent to challenge directly), then the per-game option
// pickers — board, dictionary, invalid words (shared with the hot-seat setup
// screen, see optionPickers) — plus the two settings only a two-device game
// has: turn order and the async time control. Then the invite-link view.
// Firebase-free — sync/NewGameFlow drives it.
import {
  Button,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { friendsFrom, InviteLinkView, type Friend } from '@parlor/web/lobby-ui';
import { useState } from 'react';
import {
  BoardPicker,
  DictionaryPicker,
  InvalidWordsPicker,
  OptionSection,
} from './optionPickers';
import type { InvalidWordRule, LexGameOptions, SeatChoice, TimeControlDays } from '../gameOptions';

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
// The checked-as-you-place rule is the default: losing a turn is the surprising
// outcome, so it is the one a host has to choose on purpose.
const DEFAULT_INVALID_WORDS: InvalidWordRule = 'blocked';

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
  const [invalidWords, setInvalidWords] = useState<InvalidWordRule>(DEFAULT_INVALID_WORDS);
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
      <BoardPicker value={rulesetId} onChange={setRulesetId} />
      <DictionaryPicker value={dictionaryId} onChange={setDictionaryId} />
      <InvalidWordsPicker value={invalidWords} onChange={setInvalidWords} />
      <OptionSection label="Who goes first">
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
      </OptionSection>
      <OptionSection label="Time per move">
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
      </OptionSection>
      <Button
        variant="contained"
        size="large"
        disabled={busy}
        onClick={() =>
          onCreate({
            options: {
              rulesetId,
              dictionaryId,
              timeControl: days === null ? null : { days },
              invalidWords,
            },
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

