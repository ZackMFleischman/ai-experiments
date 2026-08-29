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
// score bar until the next move replaces it: who, what they tried, and what it
// cost. Naming the word is deliberate (§3.3) — the same way an over-the-board
// challenge reveals a phoney before it is withdrawn. Only the words the play
// FORMED are public; the rest of the rack is not. Tapping it opens the score
// sheet, where the same turn is marked in the history.
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { invalidWordList } from '../gameOptions';

export function PhoneyBanner({
  name,
  words,
  onOpenSheet,
}: {
  name: string;
  /** The words the refused play formed. Empty only for a game recorded before
   * the words were public — the sentence degrades to the bare outcome. */
  words: readonly string[];
  onOpenSheet?: () => void;
}) {
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
        {words.length > 0
          ? `${name} tried to play ${invalidWordList(words)} — turn lost`
          : `${name} played a word that isn’t in the dictionary — turn lost`}
      </Typography>
    </Box>
  );
}
