// Compact player bar (T3.9 / DESIGN §7.1): names + scores + side-to-move
// marker, with the score-sheet button.
import ListAltIcon from '@mui/icons-material/ListAlt';
import { Box, IconButton, Paper, Typography } from '@mui/material';
import type { Seat } from '@lex/engine';

export interface ScoreBarProps {
  names: readonly string[];
  scores: readonly number[];
  toMove: Seat;
  onOpenSheet: () => void;
}

export function ScoreBar({ names, scores, toMove, onOpenSheet }: ScoreBarProps) {
  return (
    <Paper
      square
      elevation={1}
      data-testid="score-bar"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75 }}
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
            {score}
          </Typography>
        </Box>
      ))}
      <Box sx={{ flex: 1 }} />
      <IconButton aria-label="score sheet" size="small" onClick={onOpenSheet}>
        <ListAltIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}
