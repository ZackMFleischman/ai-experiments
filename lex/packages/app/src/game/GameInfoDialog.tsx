// Game-info menu (T4.7, DESIGN §7.1): restates the options pinned at
// creation — board, dictionary, time control — mid-game. Pure display;
// options are immutable after creation (§2.2).
import {
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { DICTIONARIES } from '@lex/dict';
import { boardName, timeControlLabel } from '../gameOptions';

export function GameInfoDialog({
  open,
  onClose,
  rulesetId,
  dictionaryId,
  timeControl,
}: {
  open: boolean;
  onClose: () => void;
  rulesetId: string;
  dictionaryId: string;
  /** Omit entirely for hot-seat (no clock concept on one device). */
  timeControl?: { days: 1 | 3 | 7 } | null;
}) {
  const dict = DICTIONARIES.find((d) => d.id === dictionaryId);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" data-testid="game-info-dialog">
      <DialogTitle>This game</DialogTitle>
      <DialogContent>
        <List dense>
          <ListItem disableGutters>
            <ListItemText primary="Board" secondary={boardName(rulesetId)} />
          </ListItem>
          <ListItem disableGutters>
            <ListItemText
              primary="Dictionary"
              secondary={
                dict ? `${dict.name} · ${Math.round(dict.wordCount / 1000)}k words` : dictionaryId
              }
            />
          </ListItem>
          {timeControl !== undefined && (
            <ListItem disableGutters>
              <ListItemText primary="Time control" secondary={timeControlLabel(timeControl)} />
            </ListItem>
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
}
