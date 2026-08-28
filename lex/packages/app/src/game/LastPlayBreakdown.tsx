// "How did they get 19?" — the last-play badge expands into the words that
// play formed and what each was worth (T3.9 / DESIGN §7.2). The score sheet
// has the same facts a drawer away, but the question is asked while looking
// AT the play, so the answer belongs on the badge.
//
// A popover, not another board floater: it is anchored to the badge, dismissed
// by a tap anywhere, and flips itself away from the screen edges — so unlike
// the thing it explains it can't sit on the board and stay there.
//
// Every number here is recorded verdict data (LastPlay.words, filled at apply
// time); nothing is rescored. The words survive the multiplayer sync path,
// which keeps word + score and drops only the cells.
import { Box, Divider, Popover, Typography } from '@mui/material';
import type { LastPlay } from '../controller/GameController';

export interface LastPlayBreakdownProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  play?: LastPlay;
  /** Display name of the seat that played it. */
  by: string;
}

export function LastPlayBreakdown({ anchorEl, onClose, play, by }: LastPlayBreakdownProps) {
  const words = play?.words ?? [];
  // A bonus the words don't account for (a bingo). Stated as the arithmetic
  // gap it is — the UI doesn't know the ruleset's bonus rules, only that the
  // recorded total is bigger than the recorded words.
  const bonus = (play?.total ?? 0) - words.reduce((n, w) => n + w.score, 0);

  return (
    <Popover
      open={anchorEl !== null && play !== undefined}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      slotProps={{ paper: { sx: { minWidth: 168, maxWidth: 260 } } }}
    >
      <Box data-testid="last-play-breakdown" sx={{ px: 1.25, py: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {by} played
        </Typography>
        {words.map((w, i) => (
          <Box
            key={`${w.word}-${i}`}
            data-testid="breakdown-word"
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.25 }}
          >
            <Typography
              component="span"
              sx={{
                flex: 1,
                minWidth: 0,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {w.word}
            </Typography>
            <Typography component="span" sx={{ fontSize: 14 }}>
              {w.score}
            </Typography>
          </Box>
        ))}
        {bonus > 0 && (
          <Box
            data-testid="breakdown-bonus"
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.25 }}
          >
            <Typography component="span" sx={{ flex: 1, fontSize: 14, color: 'secondary.main', fontWeight: 700 }}>
              ★ Bonus
            </Typography>
            <Typography component="span" sx={{ fontSize: 14, color: 'secondary.main', fontWeight: 700 }}>
              {bonus}
            </Typography>
          </Box>
        )}
        <Divider sx={{ my: 0.5 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography component="span" sx={{ flex: 1, fontSize: 13, color: 'text.secondary' }}>
            Total
          </Typography>
          <Typography data-testid="breakdown-total" component="span" sx={{ fontSize: 16, fontWeight: 800 }}>
            +{play?.total ?? 0}
          </Typography>
        </Box>
      </Box>
    </Popover>
  );
}
