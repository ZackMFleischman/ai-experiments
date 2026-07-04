// Result overlay (T3.10, DESIGN §7.4): headline + reason, the score story
// (final scores with end-adjustment line items), stats, and actions.
// Everything shown was computed by the engine/controller — display only.
import { Box, Button, Dialog, DialogContent, Stack, Typography } from '@mui/material';
import type { GameEnd, SheetRow } from '../controller/GameController';

export interface ResultOverlayProps {
  open: boolean;
  end: GameEnd;
  names: readonly string[];
  sheet: readonly SheetRow[];
  onRematch: () => void;
  onViewBoard: () => void;
  onBackToLobby?: () => void;
}

function headline(end: GameEnd, names: readonly string[]): { title: string; reason: string } {
  const name = (seat: number) => names[seat] ?? `Player ${seat + 1}`;
  // "You win!", not "You wins!" — the M4 perspective naming uses "You".
  const wins = (seat: number, bang = false) =>
    `${name(seat)} win${name(seat) === 'You' ? '' : 's'}${bang ? '!' : ''}`;
  switch (end.by) {
    case 'played-out':
    case 'scoreless': {
      const reason = end.by === 'played-out' ? 'Played out!' : 'Scoreless limit reached';
      if (end.winner === 'draw') {
        return { title: `Draw — ${end.finalScores[0]} apiece`, reason };
      }
      return { title: wins(end.winner, true), reason };
    }
    case 'resign':
      return { title: wins(end.winner), reason: `${name(end.winner === 0 ? 1 : 0)} resigned` };
    case 'timeout':
      return { title: wins(end.winner), reason: 'Won on time' };
  }
}

export function ResultOverlay({
  open,
  end,
  names,
  sheet,
  onRematch,
  onViewBoard,
  onBackToLobby,
}: ResultOverlayProps) {
  const { title, reason } = headline(end, names);
  const adjustments = 'adjustments' in end ? end.adjustments : undefined;
  const biggest = sheet
    .filter((row) => row.kind === 'play')
    .reduce<SheetRow | null>((best, row) => (row.score > (best?.score ?? -1) ? row : best), null);
  const moves = sheet.filter((row) => row.kind === 'play' || row.kind === 'exchange' || row.kind === 'pass').length;

  return (
    <Dialog open={open} fullWidth maxWidth="xs">
      <DialogContent data-testid="result-overlay" sx={{ textAlign: 'center', pt: 4 }}>
        <Typography variant="h4" component="p" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {reason}
        </Typography>

        <Stack spacing={1} sx={{ mb: 3 }}>
          {end.finalScores.map((score, seat) => (
            <Box key={seat} data-testid={`result-seat-${seat}`}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>{names[seat] ?? `Player ${seat + 1}`}</Typography>
                <Typography sx={{ fontWeight: 800 }}>{score}</Typography>
              </Box>
              {adjustments && adjustments[seat] !== 0 && (
                <Typography variant="caption" color="text.secondary" data-testid="adjustment-line">
                  {adjustments[seat]! > 0
                    ? `+${adjustments[seat]} from unplayed racks`
                    : `−${Math.abs(adjustments[seat]!)} unplayed tiles`}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>

        <Typography variant="body2" color="text.secondary" data-testid="result-stats" sx={{ mb: 3 }}>
          {moves} moves
          {biggest?.word ? ` · biggest word ${biggest.word} +${biggest.score}` : ''}
        </Typography>

        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="contained" onClick={onRematch}>
            Rematch
          </Button>
          <Button onClick={onViewBoard}>View board</Button>
          {onBackToLobby && <Button onClick={onBackToLobby}>Back to lobby</Button>}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
