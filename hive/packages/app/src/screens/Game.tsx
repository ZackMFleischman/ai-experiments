import { Box, CircularProgress } from '@mui/material';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { GameController } from '../controller/GameController';
import { GameScreen } from '../game/GameScreen';
import { initLocalController } from '../game/localSession';

// Full mode only: the firestore-backed game container. The static hot-seat
// build drops this branch at build time (T3.12 bundle check).
const MultiplayerGame =
  import.meta.env.VITE_HIVE_MODE === 'full'
    ? lazy(() => import('../sync/MultiplayerGame'))
    : null;

function LocalGame() {
  const [controller, setController] = useState<GameController | null>(null);
  useEffect(() => {
    void initLocalController().then(setController);
  }, []);
  if (!controller) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
        <CircularProgress />
      </Box>
    );
  }
  return <GameScreen controller={controller} />;
}

export function Game() {
  const { id } = useParams<{ id: string }>();
  if (id && id !== 'local' && MultiplayerGame) {
    return (
      <Suspense fallback={null}>
        <MultiplayerGame gameId={id} />
      </Suspense>
    );
  }
  return <LocalGame />;
}
