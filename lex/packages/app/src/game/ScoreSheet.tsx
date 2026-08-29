// Score sheet drawer (T3.9): per-turn word + score + running totals — lex's
// replacement for hive's move list. Rows come from the controller (verdict
// data recorded at apply time); nothing is recomputed here.
//
// A phoney (§2.3) is the one row that reports something going WRONG, and the
// sheet is where both players read the history of the game — so it is marked,
// not merely worded: an ✗ badge and a red-tinted row, the same visual language
// the preview card uses for a word the dictionary refuses. Scanning the sheet
// should answer "did anyone blow a turn?" without reading every line, and the
// row names the word that was tried (§3.3).
import { Box, Divider, Drawer, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SheetRow } from '../controller/GameController';
import { invalidWordList } from '../gameOptions';

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
    // The words a refused play formed are public (§3.3), so the history both
    // players read names them — same phrasing as the banner and the push.
    case 'phoney':
      return row.words.length > 0
        ? `Tried ${invalidWordList(row.words.map((w) => w.word))}`
        : 'Played a word that isn’t in the dictionary';
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
              data-kind={row.kind}
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                py: 0.75,
                ...(row.kind === 'phoney' && {
                  bgcolor: (t) => alpha(t.palette.error.main, 0.12),
                  borderRadius: 0.5,
                  px: 0.5,
                  mx: -0.5,
                }),
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ width: 22 }}>
                {row.n + 1}
              </Typography>
              <Typography variant="body2" sx={{ width: 72, fontWeight: 600 }} noWrap>
                {names[row.by] ?? `Player ${row.by + 1}`}
              </Typography>
              <Typography
                variant="body2"
                sx={{ flex: 1, ...(row.kind === 'phoney' && { color: 'error.main', fontWeight: 600 }) }}
              >
                {row.kind === 'phoney' && (
                  <Box
                    component="span"
                    aria-hidden
                    data-testid="sheet-phoney-mark"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 15,
                      height: 15,
                      mr: 0.75,
                      borderRadius: '50%',
                      bgcolor: 'error.main',
                      color: 'error.contrastText',
                      fontSize: 10,
                      fontWeight: 800,
                      lineHeight: 1,
                      verticalAlign: 'middle',
                    }}
                  >
                    ✗
                  </Box>
                )}
                {describe(row)}
              </Typography>
              {/* A phoney scored zero, and says so: a blank column would read
                  as "no score column applies here" rather than "nothing". */}
              {(row.kind === 'play' || row.kind === 'phoney') && (
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, ...(row.kind === 'phoney' && { color: 'error.main' }) }}
                >
                  {row.kind === 'phoney' ? '0' : `+${row.score}`}
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
