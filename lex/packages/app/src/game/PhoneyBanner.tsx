// "What just happened" line for a phoney (§2.3).
//
// A phoney leaves no trace on the board — nothing was placed, no score moved —
// so to the player who arrives next it is indistinguishable from a pass, and
// the only record was a row inside the score-sheet drawer. That is too quiet
// for a turn somebody lost: the opponent should learn it happened without
// having to go looking, and the mover should find the same account of their
// own turn still there when they come back.
//
// So the last play, when it was a phoney, gets a persistent strip under the
// score bar until the next move replaces it. It names the player and the
// consequence, and it names NO WORD — the letters are still in the mover's
// rack and this strip is on both players' screens (§3.3). Tapping it opens the
// score sheet, where the same turn is marked in the history.
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export function PhoneyBanner({ name, onOpenSheet }: { name: string; onOpenSheet?: () => void }) {
  return (
    <Box
      data-testid="phoney-banner"
      {...(onOpenSheet
        ? { role: 'button' as const, tabIndex: 0, onClick: onOpenSheet }
        : {})}
      onKeyDown={(e) => {
        if (onOpenSheet && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenSheet();
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        bgcolor: (t) => alpha(t.palette.error.main, 0.14),
        color: 'error.main',
        cursor: onOpenSheet ? 'pointer' : 'default',
        ...(onOpenSheet && { '&:hover, &:focus-visible': { bgcolor: (t) => alpha(t.palette.error.main, 0.22) } }),
      }}
    >
      <ReportProblemOutlinedIcon sx={{ fontSize: 16 }} />
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, textAlign: 'center', lineHeight: 1.25 }}
      >
        {name} played a word that isn’t in the dictionary — turn lost
      </Typography>
    </Box>
  );
}
