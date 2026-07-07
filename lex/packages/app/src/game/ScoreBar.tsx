// Compact player bar (T3.9 / DESIGN §7.1): names + scores + side-to-move
// marker, with the score-sheet button and the game-info menu (T4.7 — the
// chosen options stay visible mid-game). Names are shortened to first names
// (progressive fallback) so long full names don't wrap the bar, and the
// side-to-move seat carries a live move-clock when the game has a time control.
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
      sx={{ height: 22, '& .MuiChip-label': { px: 0.75 } }}
    />
  );
}

export function ScoreBar({
  names,
  scores,
  toMove,
  onOpenSheet,
  onBack,
  onInfo,
  deadlineAtMs,
}: ScoreBarProps) {
  const shown = displayNames(names as string[]);
  return (
    <Paper
      square
      elevation={1}
      data-testid="score-bar"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1 }}
    >
      {onBack && (
        <IconButton
          aria-label="leave game"
          size="small"
          onClick={onBack}
          data-testid="leave-game"
          edge="start"
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      )}
      {scores.map((score, seat) => (
        <Box
          key={seat}
          data-testid={`score-seat-${seat}`}
          data-to-move={toMove === seat ? 'true' : undefined}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            minWidth: 0,
            px: 1,
            py: 0.25,
            borderRadius: 1.5,
            ...(toMove === seat && { bgcolor: 'action.selected' }),
          }}
        >
          <Typography
            variant="body2"
            noWrap
            sx={{ fontWeight: toMove === seat ? 700 : 500, minWidth: 0 }}
          >
            {shown[seat] ?? `Player ${seat + 1}`}
          </Typography>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700, lineHeight: 1 }}>
            {formatScore(score)}
          </Typography>
          {toMove === seat && deadlineAtMs !== undefined && (
            <TurnClock deadlineAtMs={deadlineAtMs} />
          )}
        </Box>
      ))}
      <Box sx={{ flex: 1 }} />
      {onInfo && (
        <IconButton aria-label="game info" size="small" onClick={onInfo} data-testid="game-info">
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      )}
      <IconButton aria-label="score sheet" size="small" onClick={onOpenSheet}>
        <ListAltIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}
