// Player bar (T3.9 / T7.13, DESIGN §7.1): a turn line — whose turn it is, read
// from the local player's seat — above/beside a standings rail with one row per
// seat, ordered by the engine's turn queue. The rail carries each seat's queue
// position, its score, the score-sheet button and the game-info menu (T4.7 —
// the chosen options stay visible mid-game). Names are shortened to first names
// (progressive fallback) so long full names don't wrap the bar, and the seat to
// move carries a live move-clock when the game has a time control.
// The turn order is an ENGINE verdict (turnQueue) handed in as a prop: the bar
// renders it and never does the rotation arithmetic itself (lex/CLAUDE.md).
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { Box, Chip, IconButton, Paper, Typography } from '@mui/material';
import type { Seat } from '@lex/engine';
import { timeLeft, useNow } from './clock';
import { displayNames } from './names';
import { formatScore } from './score';

export interface ScoreBarProps {
  names: readonly string[];
  scores: readonly number[];
  toMove: Seat;
  /** The seat this client reads from (Snapshot.mySeat) — the local player in
   * multiplayer, the side to move in hot-seat. Phrases the turn line as
   * "Your turn". Defaults to the side to move (the hot-seat perspective). */
  mySeat?: Seat;
  /** Turn order from the engine's `turnQueue(state)`: seat to move first,
   * withdrawn seats absent. Drives the rail's order and its numerals. Empty
   * (the default) = seat order with no numerals. */
  queue?: readonly Seat[];
  /** Seats that have left the game (`GameState.withdrawn`): no queue position,
   * muted, marked "out". */
  withdrawn?: readonly Seat[];
  /** Game over — the turn line says so instead of naming a seat. */
  ended?: boolean;
  onOpenSheet: () => void;
  /** Leaves the game for the lobby / landing. Omitted where there is nowhere
   * to go back to (e.g. the standalone gallery). */
  onBack?: () => void;
  /** Opens the game-info dialog (board/dictionary/time control). */
  onInfo?: () => void;
  /** Move deadline for the side to move (ms). Omitted for hot-seat and for
   * games with no time control; drives the live clock next to that player. */
  deadlineAtMs?: number;
}

/** The side-to-move's remaining time, refreshed on a slow tick. */
function TurnClock({ deadlineAtMs }: { deadlineAtMs: number }) {
  const now = useNow();
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<AccessTimeRoundedIcon />}
      label={timeLeft(deadlineAtMs, now, true)}
      data-testid="turn-clock"
      sx={{ height: 22, flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }}
    />
  );
}

export function ScoreBar({
  names,
  scores,
  toMove,
  mySeat,
  queue = [],
  withdrawn = [],
  ended = false,
  onOpenSheet,
  onBack,
  onInfo,
  deadlineAtMs,
}: ScoreBarProps) {
  const shown = displayNames(names as string[]);
  const nameOf = (seat: Seat): string => shown[seat] ?? `Player ${seat + 1}`;
  const perspective = mySeat ?? toMove;

  // Rail order: the engine's queue first (seat to move leading), then the
  // seats it left out — the withdrawn — in seat order. Positions come from
  // the queue alone, so a withdrawn seat simply has none.
  const seats = scores.map((_score, seat) => seat);
  const order = [...queue, ...seats.filter((seat) => !queue.includes(seat))];
  const positionOf = (seat: Seat): number | null => {
    const at = queue.indexOf(seat);
    return at < 0 ? null : at + 1;
  };

  const turnText = ended
    ? 'Game over'
    : toMove === perspective
      ? 'Your turn'
      : `${nameOf(toMove)}’s turn`;

  return (
    <Paper
      square
      elevation={1}
      data-testid="score-bar"
      sx={{
        display: 'flex',
        alignItems: 'center',
        // Two tiers below 900px (turn line + controls above, rail below), one
        // row at ≥900px — pure CSS, no JS measuring.
        flexWrap: { xs: 'wrap', md: 'nowrap' },
        rowGap: 0.5,
        columnGap: { xs: 0.5, md: 1 },
        px: { xs: 1, md: 1.5 },
        py: { xs: 0.75, md: 1 },
        overflow: 'hidden',
      }}
    >
      {onBack && (
        <IconButton
          aria-label="leave game"
          size="small"
          onClick={onBack}
          data-testid="leave-game"
          edge="start"
          sx={{ order: 0, flexShrink: 0 }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      )}
      <Typography
        data-testid="turn-line"
        variant="subtitle2"
        noWrap
        sx={{ order: 1, minWidth: 0, fontWeight: 700 }}
      >
        {turnText}
      </Typography>
      <Box
        data-testid="standings-rail"
        sx={{
          // Order 2 on one row (between the turn line and the controls); last
          // on the stacked tier, where a full-width basis breaks it onto its
          // own line.
          order: { xs: 4, md: 2 },
          flexBasis: { xs: '100%', md: 'auto' },
          flexGrow: { xs: 1, md: 0 },
          flexShrink: 1,
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 0.25, sm: 0.75 },
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {order.map((seat) => {
          const out = withdrawn.includes(seat);
          const active = toMove === seat && !out;
          const position = positionOf(seat);
          return (
            <Box
              key={seat}
              data-testid={`score-seat-${seat}`}
              data-to-move={toMove === seat ? 'true' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                // Below 900px the rail owns the tier: seats take equal lanes so
                // four fit a 390px phone (names ellipsize, nothing wraps). The
                // lane is the row; the to-move highlight sits on the inner box
                // so it hugs the seat instead of painting the empty lane.
                flex: { xs: '1 1 0', md: '0 1 auto' },
                minWidth: 0,
                // A withdrawn seat is muted by COLOR, not opacity: a faded row
                // dropped its text under the 4.5:1 contrast floor, and the
                // "out" marker plus the missing numeral already carry the
                // meaning without it.
                ...(out && { color: 'text.secondary' }),
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: { xs: 0.375, sm: 0.75 },
                  minWidth: 0,
                  px: { xs: 0.375, sm: 1 },
                  py: 0.25,
                  borderRadius: 1.5,
                  ...(active && { bgcolor: 'action.selected' }),
                }}
              >
                {position !== null && (
                  <Box
                    component="span"
                    data-testid={`queue-${seat}`}
                    aria-label={`${position} in the turn order`}
                    sx={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: { xs: 15, sm: 18 },
                      height: { xs: 15, sm: 18 },
                      borderRadius: '50%',
                      fontSize: { xs: '0.6rem', sm: '0.7rem' },
                      fontWeight: 700,
                      lineHeight: 1,
                      bgcolor: active ? 'primary.main' : 'action.hover',
                      color: active ? 'primary.contrastText' : 'text.secondary',
                    }}
                  >
                    {position}
                  </Box>
                )}
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    fontWeight: active ? 700 : 500,
                    minWidth: 0,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  }}
                >
                  {nameOf(seat)}
                </Typography>
                <Typography
                  variant="h6"
                  component="span"
                  sx={{
                    fontWeight: 700,
                    lineHeight: 1,
                    flexShrink: 0,
                    fontSize: { xs: '1rem', sm: '1.25rem' },
                  }}
                >
                  {formatScore(scores[seat] ?? 0)}
                </Typography>
                {out && (
                  <Box
                    component="span"
                    data-testid={`withdrawn-${seat}`}
                    sx={{
                      flexShrink: 0,
                      px: 0.5,
                      borderRadius: 0.75,
                      border: 1,
                      borderColor: 'divider',
                      fontSize: { xs: '0.55rem', sm: '0.625rem' },
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    out
                  </Box>
                )}
                {toMove === seat && deadlineAtMs !== undefined && (
                  <TurnClock deadlineAtMs={deadlineAtMs} />
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
      {/* Slack: pushes the controls to the right edge of whichever tier they
          sit on (the stacked tier's top row, or the single row). */}
      <Box sx={{ order: { xs: 2, md: 3 }, flexGrow: 1 }} />
      {onInfo && (
        <IconButton
          aria-label="game info"
          size="small"
          onClick={onInfo}
          data-testid="game-info"
          sx={{ order: { xs: 3, md: 5 }, flexShrink: 0 }}
        >
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      )}
      <IconButton
        aria-label="score sheet"
        size="small"
        onClick={onOpenSheet}
        sx={{ order: { xs: 3, md: 5 }, flexShrink: 0 }}
      >
        <ListAltIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}
