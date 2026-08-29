// ported from hive/packages/app/src/screens/newGameView.tsx (adapted)
// New-game presentation (T4.7 + T7.15, DESIGN §7.1, FR-6..9): how many players
// (the SELECTED ruleset's `players` range — never a hard-coded 2–4), who to
// invite (one opponent at two seats, as many as you like at three or four),
// BOARD picker with a mini premium-map preview (a board that cannot seat the
// chosen count is disabled with its reason, not hidden), DICTIONARY picker
// labeled with word counts, turn order (the shared TurnOrderPicker), async
// time control and the pace of a round at this table size; then the
// invite-link view. Firebase-free — sync/NewGameFlow drives it.
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
import { RULESETS, type Ruleset } from '@lex/engine';
import { DICTIONARIES } from '@lex/dict';
import {
  friendsFrom,
  InviteLinkView,
  TurnOrderPicker,
  type Friend,
  type TurnOrderChoice,
} from '@parlor/web/lobby-ui';
import { useState } from 'react';
import { MiniBoard } from '../board/MiniBoard';
import {
  boardName,
  clampCount,
  paceLine,
  seatCounts,
  seats,
  type LexGameOptions,
  type SeatChoice,
  type SeatRange,
  type TimeControlDays,
} from '../gameOptions';

// The invite-link view and the friends helper are shared platform pieces.
export { friendsFrom, InviteLinkView, type Friend };

export interface NewGameChoices {
  options: LexGameOptions;
  /** Two seats: the classic 'me' | 'them' | 'random'. Three or more: the room's
   * turn-order choice, which createGame stores on the game doc for everyone to
   * see (the host can still change it in the room). */
  seat: SeatChoice | TurnOrderChoice;
  /** Direct challenge target; null = open game with an invite link. Always
   * null at three or more seats, where every guest arrives through `invite`. */
  opponent: Friend | null;
  /** Everyone the host picked, at three or more seats. Absent at two, where
   * `opponent` is the whole answer and the two-seat flow is untouched. */
  invite?: readonly Friend[];
}

const DEFAULT_BOARD = 'classic';
const DEFAULT_DICTIONARY = 'nwl2023'; // the official North American tournament list
const DEFAULT_DAYS: TimeControlDays = 3;

const rangeLabel = (range: SeatRange): string =>
  range.min === range.max ? `${range.min} players` : `${range.min}–${range.max} players`;

export function NewGameForm({
  onCreate,
  busy = false,
  friends = [],
  rulesets = RULESETS,
  initial,
}: {
  onCreate: (choices: NewGameChoices) => void;
  busy?: boolean;
  /** Past opponents, most recent first — offered as direct-challenge targets. */
  friends?: Friend[];
  /** The boards on offer. Injectable so the seat range stays engine data all
   * the way into the tests, rather than a constant this file believes in. */
  rulesets?: Readonly<Record<string, Ruleset>>;
  /** Opening state for the pickers — the gallery captures the 3+ form with it.
   * Left out, the form opens at the default board's minimum table. */
  initial?: { players?: number; invite?: readonly Friend[] };
}) {
  const [rulesetId, setRulesetId] = useState(DEFAULT_BOARD);
  const [dictionaryId, setDictionaryId] = useState(DEFAULT_DICTIONARY);
  const [seat, setSeat] = useState<SeatChoice>('random');
  const [order, setOrder] = useState<TurnOrderChoice>({ mode: 'random' });
  const [days, setDays] = useState<TimeControlDays>(DEFAULT_DAYS);
  const [picked, setPicked] = useState<readonly Friend[]>(initial?.invite ?? []);
  // 0 = "whatever this board's minimum is" — so the form has no opinion about
  // table size until the player expresses one. The picker only ever offers
  // counts inside the range, and the clamp keeps a count the previous board
  // allowed from surviving a change to a narrower one.
  const [chosen, setChosen] = useState(initial?.players ?? 0);

  // The range is the SELECTED board's. The fallback is unreachable through the
  // picker (it only offers ids from `rulesets`); it degrades a missing board to
  // a single inert option rather than crashing.
  const range: SeatRange = rulesets[rulesetId]?.players ?? { min: 1, max: 1 };
  const players = chosen === 0 ? range.min : clampCount(chosen, range);
  const multi = players > 2;
  // At two seats the row is single-select, exactly as it always was.
  const invited = multi ? picked : picked.slice(0, 1);
  const isPicked = (friend: Friend) => invited.some((f) => f.uid === friend.uid);
  const pace = paceLine(days === null ? null : { days }, players);

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Players
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={players}
          onChange={(_, v: number | null) => v !== null && setChosen(v)}
          fullWidth
          data-testid="player-count"
        >
          {seatCounts(range).map((n) => (
            <ToggleButton key={n} value={n} data-testid={`count-${n}`}>
              {n}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          {multi
            ? `Up to ${players} at the table — invite as many as you like and start when the seats you want are filled.`
            : 'Head to head — one opponent, one invite.'}
        </Typography>
      </Stack>
      {friends.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            {multi ? 'Invite' : 'Opponent'}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {/* The open-seat option only exists as a CHOICE at two seats: a
                room always keeps its code live, so inviting there is additive. */}
            {!multi && (
              <Chip
                label="Invite link"
                color={invited.length === 0 ? 'primary' : 'default'}
                variant={invited.length === 0 ? 'filled' : 'outlined'}
                onClick={() => setPicked([])}
                data-testid="opponent-link"
              />
            )}
            {friends.map((f) => (
              <Chip
                key={f.uid}
                label={f.name}
                color={isPicked(f) ? 'primary' : 'default'}
                variant={isPicked(f) ? 'filled' : 'outlined'}
                onClick={() =>
                  setPicked((current) =>
                    multi
                      ? current.some((x) => x.uid === f.uid)
                        ? current.filter((x) => x.uid !== f.uid)
                        : [...current, f]
                      : [f],
                  )
                }
                data-testid={`opponent-${f.uid}`}
              />
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {multi
              ? invited.length === 0
                ? 'Nobody invited yet — the game room hands you a code to share.'
                : `${invited.map((f) => f.name).join(', ')} get an invitation in their lobby. An invitation holds no seat: whoever accepts first takes one, so you can ask more people than you have seats.`
              : invited[0]
                ? `${invited[0].name} gets the challenge right in their lobby — no code needed.`
                : 'Anyone with the link or code can take the open seat.'}
          </Typography>
        </Stack>
      )}
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Board
        </Typography>
        <Stack direction="row" spacing={1.5}>
          {Object.entries(rulesets).map(([id, ruleset]) => {
            const fits = seats(ruleset.players, players);
            return (
              <Card
                key={id}
                variant="outlined"
                sx={{
                  flex: 1,
                  opacity: fits ? 1 : 0.5,
                  borderColor: rulesetId === id ? 'primary.main' : 'divider',
                  borderWidth: rulesetId === id ? 2 : 1,
                }}
              >
                <CardActionArea
                  onClick={() => setRulesetId(id)}
                  disabled={!fits}
                  data-testid={`board-${id}`}
                  aria-pressed={rulesetId === id}
                  sx={{ p: 1.25 }}
                >
                  <Stack spacing={1} alignItems="center">
                    <MiniBoard rulesetId={id} size={96} />
                    <Typography variant="body2" fontWeight={600}>
                      {boardName(id)}
                    </Typography>
                    {/* Disabled, not hidden: the board still exists, it just
                        cannot deal this many racks — say which count it takes. */}
                    {!fits && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        align="center"
                        data-testid={`board-${id}-unavailable`}
                      >
                        Takes {rangeLabel(ruleset.players)}
                      </Typography>
                    )}
                  </Stack>
                </CardActionArea>
              </Card>
            );
          })}
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
        {multi ? (
          <>
            <TurnOrderPicker maxPlayers={players} value={order} onChange={setOrder} />
            <Typography variant="body2" color="text.secondary" data-testid="order-hint">
              Nobody has joined yet — the arrangement is yours to finish in the game room.
            </Typography>
          </>
        ) : (
          <TurnOrderPicker maxPlayers={2} value={seat} onChange={setSeat} />
        )}
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
        {/* A round is one move per player, so the wait between your own turns
            grows with the table — say so where the clock is chosen. */}
        {pace && (
          <Typography variant="body2" color="text.secondary" data-testid="pace-line">
            {pace}
          </Typography>
        )}
      </Stack>
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
              // Absent at two seats: the wire shape stays byte-for-byte what
              // every game shipped before M7.
              ...(multi ? { maxPlayers: players } : {}),
            },
            seat: multi ? order : seat,
            opponent: multi ? null : (invited[0] ?? null),
            ...(multi ? { invite: invited } : {}),
          })
        }
        data-testid="create-game"
      >
        {!multi && invited[0] ? `Challenge ${invited[0].name}` : 'Create game'}
      </Button>
    </Stack>
  );
}
