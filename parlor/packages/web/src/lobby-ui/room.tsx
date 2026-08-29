// The shared 3+ "game room": the pre-start screen a parlor game shows while
// its guest list fills up (DECISIONS 2026-08-28 — seats do not exist until the
// game starts, invitations reserve nothing, and the host confirms before
// starting early). Firebase-free like the rest of lobby-ui: every action is an
// `on*` prop and the consuming game wires the callables.
//
// The two-player path is NOT migrated — `ChallengeReceived` /
// `WaitingForOpponent` in ./invite stay exactly as they are. What IS shared is
// `TurnOrderPicker`, which at two seats renders precisely today's three
// toggles with today's testids so a game can swap its hand-rolled markup for
// this component with zero test churn.
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { InviteShare } from './invite';
import {
  arrangedOrder,
  canStart,
  hostOf,
  isHost,
  moveInOrder,
  openSeats,
  type GuestList,
  type RosterEntry,
  type TurnOrderChoice,
} from './roster';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const asList = (roster: readonly RosterEntry[]): GuestList => ({
  roster,
  invited: [],
  declined: [],
});

/** The two-seat wire values, unchanged since the first parlor game. */
export type SeatToggleValue = 'me' | 'them' | 'random';

/** Which sub-panel of the 3+ picker is showing. UI state only — it never goes
 *  on the wire; the wire only ever sees a `TurnOrderChoice`. */
type OrderMode = 'random' | 'first' | 'arrange';

export type TurnOrderPickerProps =
  | {
      /** Two seats: the legacy three-toggle form. */
      maxPlayers: 2;
      value: SeatToggleValue;
      onChange: (value: SeatToggleValue) => void;
      roster?: readonly RosterEntry[] | undefined;
      disabled?: boolean | undefined;
    }
  | {
      /** Three or more seats: random / who-goes-first / manual arrangement. */
      maxPlayers: number;
      value: TurnOrderChoice;
      onChange: (value: TurnOrderChoice) => void;
      roster?: readonly RosterEntry[] | undefined;
      disabled?: boolean | undefined;
    };

/**
 * Who goes first. Two shapes behind one name, because the question is the same
 * one at every table size and the game should not have to branch on it.
 */
export function TurnOrderPicker(props: TurnOrderPickerProps) {
  // The union's two arms differ by the TYPE of `value` (a string at two seats,
  // an object at 3+), which is what actually narrows here — `maxPlayers: 2`
  // cannot narrow against the other arm's `number`.
  if (typeof props.value === 'string') {
    return (
      <SeatToggles
        value={props.value}
        onChange={props.onChange as (value: SeatToggleValue) => void}
        disabled={props.disabled}
      />
    );
  }
  return (
    <OrderArranger
      value={props.value}
      onChange={props.onChange as (value: TurnOrderChoice) => void}
      roster={props.roster ?? []}
      disabled={props.disabled}
    />
  );
}

/** FROZEN MARKUP: lex's new-game form and its e2e spec click these testids.
 *  Change the labels or the values here and you break a shipped game. */
function SeatToggles({
  value,
  onChange,
  disabled,
}: {
  value: SeatToggleValue;
  onChange: (value: SeatToggleValue) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_, v: SeatToggleValue | null) => v && onChange(v)}
      disabled={disabled ?? false}
      fullWidth
      data-testid="turn-order-picker"
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
  );
}

/**
 * The 3+ picker. Up/down buttons rather than drag-and-drop, on purpose
 * (DECISIONS): HTML5 drag is unreliable on touch, a DnD library is a
 * dependency we will not take, and buttons are keyboard- and screen-reader-
 * reachable for free.
 *
 * "Somebody goes first" emits an `arrange` choice rather than `host-seat`,
 * even when the host is the pick: one emitted mode keeps the sub-panels from
 * flipping under the user, and `arrange` is the only mode that can name a
 * non-host first. `host-seat` is still accepted as INPUT — it is what the
 * create form produces before anyone else has joined.
 */
function OrderArranger({
  value,
  onChange,
  roster,
  disabled,
}: {
  value: TurnOrderChoice;
  onChange: (value: TurnOrderChoice) => void;
  roster: readonly RosterEntry[];
  disabled?: boolean | undefined;
}) {
  const [mode, setMode] = useState<OrderMode>(
    value.mode === 'random' ? 'random' : value.mode === 'arrange' ? 'arrange' : 'first',
  );
  const resolved = arrangedOrder(asList(roster), value);
  const uids = resolved.map((e) => e.uid);
  const off = disabled ?? false;

  const pickMode = (next: OrderMode) => {
    setMode(next);
    // Normalize on switch so what everyone else sees matches the panel: random
    // clears the arrangement, the other two freeze the current preview order.
    onChange(next === 'random' ? { mode: 'random' } : { mode: 'arrange', order: uids });
  };

  return (
    <Stack spacing={1.5} data-testid="turn-order-picker">
      <ToggleButtonGroup
        exclusive
        value={mode}
        onChange={(_, v: OrderMode | null) => v && pickMode(v)}
        disabled={off}
        fullWidth
        size="small"
      >
        <ToggleButton value="random" data-testid="order-mode-random">
          Random
        </ToggleButton>
        <ToggleButton value="first" data-testid="order-mode-first">
          Pick who&apos;s first
        </ToggleButton>
        <ToggleButton value="arrange" data-testid="order-mode-arrange">
          Arrange
        </ToggleButton>
      </ToggleButtonGroup>

      {mode === 'random' && (
        <Typography variant="body2" color="text.secondary" data-testid="order-random-note">
          Seats are shuffled when the game starts — nobody knows the order until then.
        </Typography>
      )}

      {mode === 'first' && (
        <Stack spacing={1} data-testid="order-first-picker">
          <Typography variant="body2" color="text.secondary">
            Everyone else follows in the order they joined.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {roster.map((entry) => (
              <Chip
                key={entry.uid}
                label={entry.name}
                disabled={off}
                color={uids[0] === entry.uid ? 'primary' : 'default'}
                variant={uids[0] === entry.uid ? 'filled' : 'outlined'}
                data-testid={`first-${entry.uid}`}
                onClick={() =>
                  onChange({
                    mode: 'arrange',
                    order: [entry.uid, ...uids.filter((uid) => uid !== entry.uid)],
                  })
                }
              />
            ))}
          </Stack>
        </Stack>
      )}

      {mode === 'arrange' && (
        <List dense disablePadding data-testid="order-arrange-list">
          {resolved.map((entry, index) => (
            <ListItem
              key={entry.uid}
              disableGutters
              data-testid={`arrange-row-${entry.uid}`}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="small"
                    aria-label={`move ${entry.name} up`}
                    disabled={off || index === 0}
                    onClick={() => onChange({ mode: 'arrange', order: moveInOrder(uids, index, -1) })}
                    data-testid={`arrange-up-${entry.uid}`}
                  >
                    <KeyboardArrowUpIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`move ${entry.name} down`}
                    disabled={off || index === resolved.length - 1}
                    onClick={() => onChange({ mode: 'arrange', order: moveInOrder(uids, index, 1) })}
                    data-testid={`arrange-down-${entry.uid}`}
                  >
                    <KeyboardArrowDownIcon fontSize="small" />
                  </IconButton>
                </Stack>
              }
            >
              <ListItemText primary={`${index + 1}. ${entry.name}`} />
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );
}

/** The guest list: who is in, who was asked, who said no. Named *View because
 *  `GuestList` is the model type this file imports. */
export function GuestListView({
  list,
  maxPlayers,
  myUid,
  onRemove,
  onLeave,
}: {
  list: GuestList;
  maxPlayers: number;
  /** Whose row gets the "you" mark, and whose row offers Leave. */
  myUid?: string | undefined;
  /** Host-only: drop somebody from the roster or withdraw an invitation. */
  onRemove?: ((uid: string) => void) | undefined;
  onLeave?: (() => void) | undefined;
}) {
  const host = hostOf(list);
  const open = openSeats(list, maxPlayers);
  return (
    <Stack spacing={1} data-testid="guest-list">
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="overline" color="text.secondary" data-testid="seats-filled">
          {list.roster.length} of {maxPlayers} seats filled
        </Typography>
        {open > 0 && (
          <Typography variant="body2" color="text.secondary">
            {open} {plural(open, 'seat', 'seats')} open
          </Typography>
        )}
      </Stack>

      <List dense disablePadding>
        {list.roster.map((entry) => (
          <ListItem
            key={entry.uid}
            disableGutters
            data-testid={`guest-${entry.uid}`}
            secondaryAction={
              entry.uid === myUid && onLeave && host?.uid !== entry.uid ? (
                <Button size="small" color="error" onClick={onLeave} data-testid="guest-leave">
                  Leave
                </Button>
              ) : onRemove && host?.uid !== entry.uid ? (
                <IconButton
                  size="small"
                  aria-label={`remove ${entry.name}`}
                  onClick={() => onRemove(entry.uid)}
                  data-testid={`guest-remove-${entry.uid}`}
                >
                  <PersonRemoveIcon fontSize="small" />
                </IconButton>
              ) : null
            }
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{entry.name}</span>
                  {host?.uid === entry.uid && <Chip size="small" label="Host" data-testid="host-badge" />}
                  {entry.uid === myUid && <Chip size="small" variant="outlined" label="You" />}
                </Stack>
              }
            />
          </ListItem>
        ))}
      </List>

      {list.invited.length > 0 && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary">
            Invited
          </Typography>
          <List dense disablePadding>
            {list.invited.map((entry) => (
              <ListItem
                key={entry.uid}
                disableGutters
                data-testid={`invited-${entry.uid}`}
                secondaryAction={
                  onRemove ? (
                    <IconButton
                      size="small"
                      aria-label={`withdraw invitation to ${entry.name}`}
                      onClick={() => onRemove(entry.uid)}
                      data-testid={`invited-remove-${entry.uid}`}
                    >
                      <PersonRemoveIcon fontSize="small" />
                    </IconButton>
                  ) : null
                }
              >
                <ListItemText primary={entry.name} secondary="Hasn't answered yet" />
              </ListItem>
            ))}
          </List>
          {/* The whole point of the model: an invitation is an ask, not a hold. */}
          <Typography variant="body2" color="text.secondary" data-testid="no-reservation-note">
            Invitations don&apos;t hold a seat — whoever accepts first takes one.
          </Typography>
        </>
      )}

      {list.declined.length > 0 && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary">
            Declined
          </Typography>
          <List dense disablePadding>
            {list.declined.map((entry) => (
              <ListItem key={entry.uid} disableGutters data-testid={`declined-${entry.uid}`}>
                <ListItemText
                  primaryTypographyProps={{ color: 'text.disabled' }}
                  primary={entry.name}
                  secondary="Said no thanks"
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Stack>
  );
}

/**
 * The host's start control. Starting below `maxPlayers` is legal but never
 * silent (DECISIONS): it confirms, naming the empty seats and anyone still
 * deciding, because starting is the moment their invitation stops being worth
 * anything. `expectedRoster` carries the CURRENT uids so the server's
 * stale-roster guard can reject a start that raced somebody's join.
 */
export function StartGameBar({
  list,
  minPlayers,
  maxPlayers,
  onStart,
  busy = false,
}: {
  list: GuestList;
  minPlayers: number;
  maxPlayers: number;
  onStart: (expectedRoster: string[]) => void;
  busy?: boolean | undefined;
}) {
  const [confirming, setConfirming] = useState(false);
  const filled = list.roster.length;
  const open = openSeats(list, maxPlayers);
  const ready = canStart(list, minPlayers);
  const start = () => {
    setConfirming(false);
    onStart(list.roster.map((e) => e.uid));
  };
  return (
    <Stack spacing={1} data-testid="start-game-bar">
      <Button
        variant="contained"
        size="large"
        disabled={!ready || busy}
        onClick={() => (open > 0 ? setConfirming(true) : start())}
        data-testid="start-game"
      >
        {busy ? 'Starting…' : 'Start the game'}
      </Button>
      {!ready && (
        <Typography variant="body2" color="text.secondary" align="center" data-testid="start-hint">
          {minPlayers - filled} more {plural(minPlayers - filled, 'player', 'players')} needed —{' '}
          {minPlayers} to start.
        </Typography>
      )}
      <Dialog open={confirming} onClose={() => setConfirming(false)} fullWidth maxWidth="xs">
        <DialogTitle data-testid="start-early-title">
          Start with {filled} of {maxPlayers}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText data-testid="start-early-seats">
            {open === 1
              ? 'The last seat stays empty.'
              : `${open} seats stay empty.`}
          </DialogContentText>
          {list.invited.length > 0 && (
            <DialogContentText sx={{ mt: 1 }} data-testid="start-early-left-out">
              Still deciding: {list.invited.map((e) => e.name).join(', ')}. They won&apos;t be able
              to join once you start.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} data-testid="start-early-cancel">
            Keep waiting
          </Button>
          <Button variant="contained" onClick={start} data-testid="start-early-confirm">
            Start anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/**
 * The pre-start room. The host arranges and starts; everyone else watches the
 * same list and the same turn order fill in — `setTurnOrder` persists to the
 * game doc precisely so the arrangement is not a host-only secret.
 */
export function GameRoom({
  list,
  myUid,
  minPlayers,
  maxPlayers,
  code,
  turnOrder,
  onTurnOrderChange,
  onStart,
  onLeave,
  onCancel,
  onRemove,
  invitePicker,
  title = 'Game room',
  busy = false,
}: {
  list: GuestList;
  myUid: string;
  minPlayers: number;
  maxPlayers: number;
  /** The invite code, when the room has one to share. */
  code?: string | undefined;
  turnOrder: TurnOrderChoice;
  /** Host-only; omit for a non-host and the arrangement renders read-only. */
  onTurnOrderChange?: ((value: TurnOrderChoice) => void) | undefined;
  onStart?: ((expectedRoster: string[]) => void) | undefined;
  onLeave?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onRemove?: ((uid: string) => void) | undefined;
  /** The game's own friend picker — parlor has no opinion about how you find
   *  a friend, only about where the control sits. */
  invitePicker?: ReactNode;
  title?: ReactNode;
  busy?: boolean | undefined;
}) {
  const iAmHost = isHost(list, myUid);
  const resolved = arrangedOrder(list, turnOrder);
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 480 }} data-testid="game-room">
        <CardContent>
          <Stack spacing={2.5}>
            <Typography variant="h6" component="h2">
              {title}
            </Typography>

            <GuestListView
              list={list}
              maxPlayers={maxPlayers}
              myUid={myUid}
              {...(iAmHost && onRemove ? { onRemove } : {})}
              {...(!iAmHost && onLeave ? { onLeave } : {})}
            />

            <Divider />

            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                Who goes first
              </Typography>
              {iAmHost && onTurnOrderChange ? (
                <TurnOrderPicker
                  maxPlayers={maxPlayers}
                  value={turnOrder}
                  onChange={onTurnOrderChange}
                  roster={list.roster}
                  disabled={busy}
                />
              ) : (
                <Typography variant="body2" color="text.secondary" data-testid="turn-order-readonly">
                  {turnOrder.mode === 'random'
                    ? 'Shuffled when the game starts.'
                    : resolved.map((e) => e.name).join(' → ')}
                </Typography>
              )}
            </Stack>

            {(code || invitePicker) && (
              <>
                <Divider />
                <Stack spacing={2} data-testid="room-invite">
                  {code && <InviteShare code={code} />}
                  {invitePicker}
                </Stack>
              </>
            )}

            {iAmHost && onStart && (
              <StartGameBar
                list={list}
                minPlayers={minPlayers}
                maxPlayers={maxPlayers}
                onStart={onStart}
                busy={busy}
              />
            )}

            <Stack direction="row" spacing={1} justifyContent="center">
              {iAmHost
                ? onCancel && (
                    <Button color="error" disabled={busy} onClick={onCancel} data-testid="cancel-room">
                      Cancel the game
                    </Button>
                  )
                : onLeave && (
                    <Button
                      color="error"
                      disabled={busy}
                      onClick={onLeave}
                      startIcon={<ArrowBackIcon />}
                      data-testid="leave-room"
                    >
                      Leave
                    </Button>
                  )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

/**
 * The invitee's side of a 3+ room. NOT `ChallengeReceived`, which answers a
 * two-player challenge and stays untouched: here the answer is "yes, if there
 * is still room", so the screen leads with who is already in and how many
 * seats are left, and says plainly that arriving first is what gets you one.
 */
export function InvitationReceived({
  hostName,
  names,
  filled,
  maxPlayers,
  onRespond,
  busy = false,
  blurb,
}: {
  hostName: string;
  /** Roster display names in join order — the invite preview carries no uids. */
  names: readonly string[];
  filled: number;
  maxPlayers: number;
  onRespond: (accept: boolean) => void;
  busy?: boolean | undefined;
  blurb?: ReactNode;
}) {
  const open = Math.max(0, maxPlayers - filled);
  const others = names.filter((n) => n !== hostName);
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 440 }} data-testid="invitation-received">
        <CardContent>
          <Stack spacing={2.5} alignItems="center" sx={{ py: 1 }}>
            <Typography variant="h6" component="h2">
              {hostName} invited you to a game
            </Typography>
            <Typography color="text.secondary" align="center" data-testid="invitation-roster">
              {others.length > 0
                ? `${hostName} and ${others.join(', ')} are in.`
                : `${hostName} is in — you'd be the first to join.`}
            </Typography>
            <Typography color="text.secondary" align="center" data-testid="invitation-seats">
              {open === 0
                ? `All ${maxPlayers} seats are taken.`
                : `${filled} of ${maxPlayers} seats filled — ${open} ${plural(open, 'seat', 'seats')} left.`}
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              {blurb ?? 'An invitation does not hold a seat — accept to take one before somebody else does.'}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                color="error"
                disabled={busy}
                onClick={() => onRespond(false)}
                data-testid="invitation-decline"
              >
                No thanks
              </Button>
              <Button
                variant="contained"
                disabled={busy || open === 0}
                onClick={() => onRespond(true)}
                data-testid="invitation-accept"
              >
                Take a seat
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
