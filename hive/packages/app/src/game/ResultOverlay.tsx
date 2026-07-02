// Result overlay + persistent banner (T3.9, DESIGN §6.3 minus rematch).
// Full-screen sheet on phones, centered card above; restrained per-outcome tone.
import { Box, Button, Dialog, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { GameController, GameEnd, Snapshot } from '../controller/GameController';
import '../board/board.css';

export function endHeadline(end: GameEnd): { title: string; reason: string; hero: 'w' | 'b' | null } {
  switch (end.by) {
    case 'surround':
      return end.winner
        ? {
            title: 'Queen surrounded!',
            reason: `${end.winner === 'w' ? 'White' : 'Black'} wins`,
            hero: end.winner,
          }
        : { title: 'Both queens fell', reason: 'Draw by simultaneous surround', hero: null };
    case 'repetition':
      return { title: 'Draw', reason: 'Threefold repetition', hero: null };
    case 'resign':
      return {
        title: `${end.winner === 'w' ? 'Black' : 'White'} resigned`,
        reason: `${end.winner === 'w' ? 'White' : 'Black'} wins`,
        hero: end.winner,
      };
    case 'draw-agreed':
      return { title: 'Draw agreed', reason: 'Both players settled for the split', hero: null };
  }
}

const OUTCOME_TINT: Record<GameEnd['by'], string> = {
  surround: '#e8a013',
  resign: '#8d6e63',
  repetition: '#78909c',
  'draw-agreed': '#78909c',
};

export function ResultOverlay({
  controller,
  snap,
}: {
  controller: GameController;
  snap: Snapshot;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  if (!snap.end) return null;
  const { title, reason, hero } = endHeadline(snap.end);
  const moveCount = snap.log.filter((e) => e.kind === 'move' || e.kind === 'pass').length;
  const tint = OUTCOME_TINT[snap.end.by];

  return (
    <Dialog open={snap.overlayOpen} fullScreen={fullScreen} onClose={() => controller.dismissOverlay()}>
      <Box
        data-testid="result-overlay"
        className="hive-board-scope"
        sx={{
          minWidth: { sm: 380 },
          minHeight: fullScreen ? '100dvh' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 4,
          borderTop: 6,
          borderColor: tint,
        }}
      >
        {hero ? (
          <svg width={120} height={120} className={`hive-tile-${hero}`} role="img" aria-label={`${hero} queen`}>
            <use href="#hex-base" width={120} height={120} />
            <use href="#bug-queen" x={12} y={12} width={96} height={96} />
          </svg>
        ) : (
          <Box sx={{ display: 'flex' }}>
            <svg width={90} height={90} className="hive-tile-w" role="img" aria-label="white queen">
              <use href="#hex-base" width={90} height={90} />
              <use href="#bug-queen" x={9} y={9} width={72} height={72} />
            </svg>
            <svg width={90} height={90} className="hive-tile-b" style={{ marginLeft: -18 }} role="img" aria-label="black queen">
              <use href="#hex-base" width={90} height={90} />
              <use href="#bug-queen" x={9} y={9} width={72} height={72} />
            </svg>
          </Box>
        )}
        <Typography variant="h4" component="h2" textAlign="center" fontWeight={700}>
          {title}
        </Typography>
        <Typography color="text.secondary">{reason}</Typography>
        <Typography variant="caption" color="text.secondary" data-testid="result-stats">
          {moveCount} moves
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Button variant="contained" onClick={() => void controller.newGame()} data-testid="overlay-new-game">
            New game
          </Button>
          <Button onClick={() => controller.dismissOverlay()} data-testid="overlay-view-board">
            View board
          </Button>
          <Button component={RouterLink} to="/lobby">
            Back to lobby
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
}

/** Persistent banner once the overlay is dismissed ("view board" mode). */
export function ResultBanner({ controller, snap }: { controller: GameController; snap: Snapshot }) {
  if (!snap.end || snap.overlayOpen || snap.beat) return null; // the beat owns the moment
  const { title, reason } = endHeadline(snap.end);
  return (
    <Box
      data-testid="result-banner"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.5,
        bgcolor: 'action.hover',
        borderLeft: 4,
        borderColor: OUTCOME_TINT[snap.end.by],
      }}
    >
      <Typography variant="body2" sx={{ flex: 1 }}>
        {title} — {reason}
      </Typography>
      <Button size="small" onClick={() => controller.reopenOverlay()}>
        Summary
      </Button>
    </Box>
  );
}
