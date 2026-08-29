// Catch-up player (T7.14, DESIGN §7.1): at three and four seats several turns
// happen between yours, so you come back to a board that changed three times.
// This strip names each move you missed and steps through them — the board
// rewinds to the position AS OF the reviewed move (GameController.review) and
// the move's own cells take over the last-play highlight. It never blocks
// acting: it is a caption with two arrows, the rack and the action row below
// stay live, and staging a tile drops straight back to the live board.
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box, Button, IconButton, Paper, Typography } from '@mui/material';
import type { ReviewState, SheetRow } from '../controller/GameController';
import { displayNames } from './names';

export interface CatchUpBarProps {
  review: ReviewState;
  names: readonly string[];
  onPrev: () => void;
  onNext: () => void;
  onLive: () => void;
}

/** What happened, in one sentence: "Sam played QUIZ +68". Score data comes
 * from the recorded row — nothing is recomputed here. */
export function describeMove(row: SheetRow, name: string): string {
  switch (row.kind) {
    case 'play':
      return `${name} played ${row.word ?? '—'} +${row.score}`;
    // A phoney leaves the board untouched, so the bar has to say what happened
    // or the catch-up reads as a pass — the same reason the banner exists.
    case 'phoney':
      return `${name} tried ${row.word ?? 'an invalid word'} — turn lost`;
    case 'exchange':
      return `${name} exchanged ${row.count ?? 0}`;
    case 'pass':
      return `${name} passed`;
    case 'resign':
      return `${name} withdrew`;
    case 'timeout':
      return `${name} ran out of time`;
  }
}

/** ≥44px hit target (NFR-7). */
const arrow = { width: 44, height: 44 } as const;

export function CatchUpBar({ review, names, onPrev, onNext, onLive }: CatchUpBarProps) {
  const shown = displayNames(names as string[]);
  const name = shown[review.row.by] ?? `Player ${review.row.by + 1}`;
  const live = review.board === null;

  return (
    <Paper
      square
      elevation={0}
      data-testid="catch-up-bar"
      data-live={live ? 'true' : undefined}
      sx={{
        // Full-bleed band, but its contents keep a readable measure: stretched
        // across a desktop window the ‹ and › ended up a screen apart from the
        // sentence they step through.
        display: 'flex',
        justifyContent: 'center',
        px: 0.5,
        py: 0.25,
        bgcolor: 'action.hover',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', maxWidth: 640 }}>
        <IconButton
          aria-label="previous move"
          data-testid="catch-up-prev"
          size="small"
          disabled={review.index === 0}
          onClick={onPrev}
          sx={arrow}
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {describeMove(review.row, name)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {live
              ? `${review.total} moves to catch up on`
              : `${review.index + 1} of ${review.total} moves you missed`}
          </Typography>
        </Box>
        <IconButton
          aria-label="next move"
          data-testid="catch-up-next"
          size="small"
          disabled={live}
          onClick={onNext}
          sx={arrow}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        {/* Always present so the way back is never something to hunt for; it is
            simply spent once the board is live again. */}
        <Button
          data-testid="catch-up-live"
          size="small"
          disabled={live}
          onClick={onLive}
          sx={{ minHeight: 36, flexShrink: 0, fontWeight: 700 }}
        >
          Live
        </Button>
      </Box>
    </Paper>
  );
}
