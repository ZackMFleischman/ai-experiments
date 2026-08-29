// Score sheet drawer (T3.9, columnar at T7.14): the paper score sheet — a
// COLUMN per player, a ROW per round, each cell carrying that player's play
// and what it scored, with the running total footing every column. The flat
// "who did what, totals joined by dashes" list it replaced was unreadable the
// moment there were more than two of those totals. Rows come from the
// controller (verdict data recorded at apply time); nothing is recomputed here.
import { Box, Drawer, Typography } from '@mui/material';
import type { SheetRow } from '../controller/GameController';
import { displayNames } from './names';

export interface ScoreSheetProps {
  open: boolean;
  onClose: () => void;
  rows: readonly SheetRow[];
  names: readonly string[];
}

function describe(row: SheetRow, seats: number): string {
  switch (row.kind) {
    case 'play':
      return row.words.map((w) => w.word).join(' / ') || '—';
    case 'exchange':
      return `Exchanged ${row.count ?? 0}`;
    case 'pass':
      return 'Pass';
    case 'resign':
      // At 3+ a resign is a withdrawal, not the end of the game (DECISIONS
      // 2026-08-28); at two seats the wording is what it always was.
      return seats > 2 ? 'Withdrew' : 'Resigned';
    case 'timeout':
      return 'Forfeited on time';
  }
}

/**
 * Deal the flat row list into score-sheet columns: each seat's turns stack
 * down its own column, so round N is the Nth line of every column. A seat
 * that withdraws simply stops adding lines — its column ends where it left.
 */
export function sheetColumns(
  rows: readonly SheetRow[],
  seats: number,
): ReadonlyArray<ReadonlyArray<SheetRow | null>> {
  const filled: number[] = Array.from({ length: seats }, () => 0);
  const grid: Array<Array<SheetRow | null>> = [];
  for (const row of rows) {
    if (row.by < 0 || row.by >= seats) continue;
    const at = filled[row.by]!;
    while (grid.length <= at) grid.push(Array.from({ length: seats }, () => null));
    grid[at]![row.by] = row;
    filled[row.by] = at + 1;
  }
  return grid;
}

/** Where each column stands after the last row that touched it. */
function finalTotals(rows: readonly SheetRow[], seats: number): number[] {
  const last = rows[rows.length - 1];
  return Array.from({ length: seats }, (_, seat) => last?.totals[seat] ?? 0);
}

export function ScoreSheet({ open, onClose, rows, names }: ScoreSheetProps) {
  const seats = Math.max(names.length, ...rows.map((r) => r.totals.length), 2);
  // A column per SEAT, even if the caller named fewer of them.
  const shown = displayNames(
    Array.from({ length: seats }, (_, seat) => names[seat] ?? `Player ${seat + 1}`),
  );
  const grid = sheetColumns(rows, seats);
  const totals = finalTotals(rows, seats);
  // One template for every row, so the columns line up without a <table>.
  const columns = `24px repeat(${seats}, minmax(80px, 1fr))`;
  const cell = { px: 0.5, py: 0.75, minWidth: 0 } as const;

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
        {rows.length > 0 && (
          // The sheet scrolls sideways INSIDE this box at many seats; the page
          // itself never does.
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: 24 + seats * 80 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: columns,
                  borderBottom: 2,
                  borderColor: 'divider',
                }}
              >
                <Box sx={cell} />
                {shown.map((name, seat) => (
                  <Typography
                    key={seat}
                    data-testid="sheet-column-head"
                    variant="body2"
                    noWrap
                    sx={{ ...cell, fontWeight: 700 }}
                  >
                    {name}
                  </Typography>
                ))}
              </Box>
              {grid.map((round, n) => (
                <Box
                  key={n}
                  data-testid="sheet-row"
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: columns,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ ...cell, pt: 1 }}>
                    {n + 1}
                  </Typography>
                  {round.map((row, seat) => (
                    <Box key={seat} data-testid="sheet-cell" sx={cell}>
                      {row ? (
                        <>
                          <Typography
                            variant="body2"
                            // Slightly tighter than body: an 80px column has
                            // to hold "Exchanged 3" without breaking it.
                            sx={{ fontSize: '0.8125rem', lineHeight: 1.3, wordBreak: 'break-word' }}
                          >
                            {describe(row, seats)}
                          </Typography>
                          <Typography
                            variant="caption"
                            color={row.kind === 'play' ? 'text.primary' : 'text.secondary'}
                            sx={{ fontWeight: row.kind === 'play' ? 700 : 400 }}
                          >
                            {row.kind === 'play' ? `+${row.score}` : '—'}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.disabled">
                          ·
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              ))}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: columns,
                  borderTop: 2,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ ...cell, pt: 1 }}>
                  Σ
                </Typography>
                {totals.map((total, seat) => (
                  <Typography
                    key={seat}
                    data-testid="sheet-total"
                    variant="subtitle2"
                    sx={{ ...cell, fontWeight: 700 }}
                  >
                    {total}
                  </Typography>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
