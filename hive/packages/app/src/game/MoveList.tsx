// Move list drawer (T3.8): UHP rows + meta events, source-of-truth order.
import { Drawer, List, ListItem, ListItemText, Typography } from '@mui/material';
import type { LogEntry } from '../controller/transport';

function metaText(entry: LogEntry): string {
  if ('uhp' in entry) return entry.uhp;
  const who = entry.by === 'w' ? 'White' : 'Black';
  switch (entry.kind) {
    case 'resign':
      return `${who} resigned`;
    case 'draw-offer':
      return `${who} offered a draw`;
    case 'draw-accept':
      return `${who} accepted the draw`;
    case 'draw-decline':
      return `${who} declined the draw`;
  }
}

export function MoveList({
  log,
  open,
  onClose,
}: {
  log: readonly LogEntry[];
  open: boolean;
  onClose: () => void;
}) {
  let n = 0;
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Typography variant="subtitle1" sx={{ p: 2, pb: 0, fontWeight: 700 }}>
        Moves
      </Typography>
      <List dense data-testid="move-list" sx={{ minWidth: 220 }}>
        {log.length === 0 && (
          <ListItem>
            <ListItemText secondary="No moves yet." />
          </ListItem>
        )}
        {log.map((entry, i) => {
          if (entry.kind === 'move' || entry.kind === 'pass') {
            n += 1;
            return (
              <ListItem key={i} data-testid="move-row">
                <ListItemText
                  primary={`${n}. ${entry.kind === 'pass' ? 'pass' : entry.uhp}`}
                  primaryTypographyProps={{ fontFamily: 'monospace', fontSize: 14 }}
                />
              </ListItem>
            );
          }
          return (
            <ListItem key={i} data-testid="meta-row">
              <ListItemText secondary={metaText(entry)} />
            </ListItem>
          );
        })}
      </List>
    </Drawer>
  );
}
