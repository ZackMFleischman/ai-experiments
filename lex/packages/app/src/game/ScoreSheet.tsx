// Score sheet drawer (T3.9): per-turn word + score + running totals — lex's
// replacement for hive's move list. Rows come from the controller (verdict
// data recorded at apply time); nothing is recomputed here.
import { Box, Divider, Drawer, Typography } from '@mui/material';
import type { SheetRow } from '../controller/GameController';

export interface ScoreSheetProps {
  open: boolean;
  onClose: () => void;
  rows: readonly SheetRow[];
  names: readonly string[];
}

function describe(row: SheetRow): string {
  switch (row.kind) {
    case 'play':
      return row.words.map((w) => w.word).join(' / ') || '—';
    // The words are the mover's own tiles, so the sheet — which BOTH players
    // read — records that a turn was burned, never on what.
    case 'phoney':
      return 'Not a word — turn lost';
    case 'exchange':
      return `Exchanged ${row.count ?? 0}`;
    case 'pass':
      return 'Pass';
    case 'resign':
      return 'Resigned';
    case 'timeout':
      return 'Forfeited on time';
  }
}

export function ScoreSheet({ open, onClose, rows, names }: ScoreSheetProps) {
  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}>
      <Box data-testid="score-sheet" sx={{ p: 2, maxHeight: '60dvh', overflowY: 'auto' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Score sheet
        </Typography>
        {rows.length === 0 && (
          <Typography color="text.secondary" variant="body2">
            No turns yet.
          </Typography>
        )}
        {rows.map((row) => (
          <Box key={row.n}>
            <Box
              data-testid="sheet-row"
              sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.75 }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ width: 22 }}>
                {row.n + 1}
              </Typography>
              <Typography variant="body2" sx={{ width: 72, fontWeight: 600 }} noWrap>
                {names[row.by] ?? `Player ${row.by + 1}`}
              </Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {describe(row)}
              </Typography>
              {row.kind === 'play' && (
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  +{row.score}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ width: 64, textAlign: 'right' }}>
                {row.totals.join(' — ')}
              </Typography>
            </Box>
            <Divider />
          </Box>
        ))}
      </Box>
    </Drawer>
  );
}
