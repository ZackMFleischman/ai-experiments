// Hard-mode phoney beat (DESIGN §2.3): the moment the withheld verdict comes
// due. In hard mode the preview card never says whether a word counts, so the
// player commits on a guess — and when the guess is wrong the turn is simply
// gone. That has to be TOLD, not inferred from a board that didn't change:
// without this beat, a lost turn looks exactly like a bug.
//
// So it is a blocking, explicitly-dismissed dialog rather than a toast: it
// names the word(s) the dictionary refused (the mover's own tiles — nothing
// the opponent may see, which is why the sheet keeps none of it), states the
// consequence in one line, and waits.
//
// It sits ABOVE the hot-seat pass-device interstitial (§7.3) rather than
// deferring to it or replacing it. Deferring loses the news behind an opaque
// screen a frame after it appears; replacing it would expose the INCOMING
// player's rack behind the dialog, since a phoney has already spent the turn.
// Rendering on top gets both: the interstitial stays the thing hiding the rack,
// and it becomes this dialog's backdrop.
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';

export interface PhoneyBeatProps {
  /** The refused words, in the order the play formed them. */
  words: readonly string[];
  onDismiss: () => void;
}

export function PhoneyBeat({ words, onDismiss }: PhoneyBeatProps) {
  const many = words.length > 1;
  return (
    <Dialog
      open
      onClose={onDismiss}
      maxWidth="xs"
      fullWidth
      data-testid="phoney-beat"
      aria-labelledby="phoney-beat-title"
      // Above the pass-device interstitial (zIndex.modal + 1) — see the note
      // at the top of this file.
      sx={{ zIndex: (t) => t.zIndex.modal + 2 }}
    >
      <DialogTitle id="phoney-beat-title" sx={{ color: 'error.main', fontWeight: 800 }}>
        {many ? 'Not words' : 'Not a word'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {/* The words themselves, big — this is the one screen that ever
              shows them, and "which one was wrong" is the whole question. */}
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {words.map((word) => (
              <Typography
                key={word}
                data-testid="phoney-word"
                component="span"
                sx={{
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'error.main',
                }}
              >
                {word}
              </Typography>
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {many ? "aren’t" : "isn’t"} in this game’s dictionary. Your tiles came back and your
            turn is over — that’s hard mode.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onDismiss} data-testid="phoney-dismiss" autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
