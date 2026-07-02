import { Box, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import type { GameController } from '../controller/GameController';
import { GameScreen } from '../game/GameScreen';
import { initLocalController } from '../game/localSession';

export function Game() {
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
