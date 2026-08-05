// Score sheet drawer (T3.9): per-turn word + score + running totals — lex's
// replacement for hive's move list. Rows come from the controller (verdict
// data recorded at apply time); nothing is recomputed here.
import { Box, Divider, Drawer, Link, Typography } from '@mui/material';
import type { SheetRow } from '../controller/GameController';

export interface ScoreSheetProps {
  open: boolean;
  onClose: () => void;
  rows: readonly SheetRow[];
  names: readonly string[];
  /** Tapping a played word asks for its definition (T7.2). Omitted = the words
   * render as plain text, which is what the gallery's static states want. */
  onDefine?: (word: string) => void;
}

/** Non-play turns have no words to define — they describe themselves. */
function describe(row: SheetRow): string {
  switch (row.kind) {
    case 'play':
      return row.words.map((w) => w.word).join(' / ') || '—';
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

/** A play's words, each one a tap target for its definition. */
function PlayedWords({ row, onDefine }: { row: SheetRow; onDefine: (word: string) => void }) {
  if (row.words.length === 0) return <>—</>;
  return (
    <>
      {row.words.map((w, i) => (
        <Box component="span" key={`${w.word}-${i}`}>
          {i > 0 && ' / '}
          <Link
            component="button"
            type="button"
            underline="hover"
            color="inherit"
            data-testid="sheet-word"
            aria-label={`Define ${w.word}`}
            onClick={() => onDefine(w.word)}
            // Inline in a dense row, so the 44px target is grown around the
            // word (NFR-7) instead of spacing the rows apart.
            sx={{
              font: 'inherit',
              position: 'relative',
              textDecorationStyle: 'dotted',
              textDecorationLine: 'underline',
              '&::before': { content: '""', position: 'absolute', inset: '-13px -4px' },
            }}
          >
            {w.word}
          </Link>
        </Box>
      ))}
    </>
  );
}

export function ScoreSheet({ open, onClose, rows, names, onDefine }: ScoreSheetProps) {
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
                {onDefine && row.kind === 'play' ? (
                  <PlayedWords row={row} onDefine={onDefine} />
                ) : (
                  describe(row)
                )}
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
