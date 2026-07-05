// Compact player bar (T3.9 / DESIGN §7.1): names + scores + side-to-move
// marker, with the score-sheet button and the game-info menu (T4.7 — the
// chosen options stay visible mid-game).
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { Box, IconButton, Paper, Typography } from '@mui/material';
import type { Seat } from '@lex/engine';
import { formatScore } from './score';

export interface ScoreBarProps {
  names: readonly string[];
  scores: readonly number[];
  toMove: Seat;
  onOpenSheet: () => void;
  /** Opens the game-info dialog (board/dictionary/time control). */
  onInfo?: () => void;
}

export function ScoreBar({ names, scores, toMove, onOpenSheet, onInfo }: ScoreBarProps) {
  return (
    <Paper
      square
      elevation={1}
      data-testid="score-bar"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1 }}
    >
      {scores.map((score, seat) => (
        <Box
          key={seat}
          data-testid={`score-seat-${seat}`}
          data-to-move={toMove === seat ? 'true' : undefined}
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 0.75,
            px: 1,
            py: 0.25,
            borderRadius: 1.5,
            ...(toMove === seat && { bgcolor: 'action.selected' }),
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: toMove === seat ? 700 : 500 }}>
            {names[seat] ?? `Player ${seat + 1}`}
          </Typography>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700, lineHeight: 1 }}>
            {formatScore(score)}
          </Typography>
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
