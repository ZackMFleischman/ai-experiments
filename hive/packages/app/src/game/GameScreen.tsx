// The game screen (T3.8/T3.9): chrome around GameBoard — player bars, tray,
// move list, menu, end-of-game beat and result overlay.
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { Box, IconButton, Typography, Snackbar } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { cellCenter } from '../board/hexGeometry';
import { GameBoard } from '../board/GameBoard';
import { HandTray } from '../board/HandTray';
import type { GameController } from '../controller/GameController';
import { useGameController } from '../controller/useGameController';
import { GameMenu } from './GameMenu';
import { MoveList } from './MoveList';
import { PlayerBar } from './PlayerBar';
import { ResultBanner, ResultOverlay } from './ResultOverlay';

export function GameScreen({
  controller,
  staticMode = false,
  onRematch,
}: {
  controller: GameController;
  staticMode?: boolean;
  /** Multiplayer (T4.7): overlay offers Rematch instead of New game. */
  onRematch?: () => void;
}) {
  const snap = useGameController(controller);
  const [movesOpen, setMovesOpen] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState(0);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debug surface for validators (the loom `window.__loom` convention).
  useEffect(() => {
    (window as unknown as { __hive?: unknown }).__hive = { controller };
  }, [controller]);

  // The end-of-game beat (§6.3): center the surrounded queen, pulse its ring,
  // pause ~1s (tap to skip), then the overlay.
  useEffect(() => {
    if (!snap.beat) return;
    const { x, y } = cellCenter(snap.beat.center);
    controller.setView({ cx: x, cy: y, zoom: 1.4 });
    if (staticMode) return; // gallery: hold the beat frame
    beatTimer.current = setTimeout(() => controller.finishBeat(), 1100);
    const skip = () => controller.finishBeat();
    window.addEventListener('pointerdown', skip, { once: true });
    return () => {
      if (beatTimer.current) clearTimeout(beatTimer.current);
      window.removeEventListener('pointerdown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!snap.beat]);

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, gap: 0.5 }}>
        <IconButton component={RouterLink} to="/lobby" aria-label="back to lobby" size="small">
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle1" fontWeight={700} letterSpacing="0.15em" sx={{ flex: 1 }}>
          HIVE
        </Typography>
        <IconButton aria-label="move list" size="small" onClick={() => setMovesOpen(true)}>
          <ListAltIcon fontSize="small" />
        </IconButton>
        <GameMenu controller={controller} snap={snap} />
      </Box>
      <ResultBanner controller={controller} snap={snap} />
      <PlayerBar snap={snap} color="b" />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <GameBoard controller={controller} />
      </Box>
      <PlayerBar snap={snap} color="w" />
      <Box sx={{ px: 1, pb: 'max(4px, env(safe-area-inset-bottom))' }}>
        <HandTray controller={controller} />
      </Box>
      <MoveList log={snap.log} open={movesOpen} onClose={() => setMovesOpen(false)} />
      <ResultOverlay controller={controller} snap={snap} {...(onRematch ? { onRematch } : {})} />
      <Snackbar
        key={snap.notice?.id ?? 0}
        open={!!snap.notice && snap.notice.id !== dismissedNotice}
        autoHideDuration={4000}
        onClose={() => setDismissedNotice(snap.notice?.id ?? 0)}
        message={snap.notice?.text}
        data-testid="notice-toast"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
