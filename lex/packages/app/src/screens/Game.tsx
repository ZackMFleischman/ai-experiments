// Game screen: /game/local is the hot-seat game (T3.8); any other id is the
// lazy full-mode multiplayer container (T4.6/T4.7) — the static hot-seat
// build drops that branch at build time (T3.12 bundle check).
import { Box, CircularProgress, Typography } from '@mui/material';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { GameController } from '../controller/GameController';
import { HotSeatGame } from '../game/HotSeatGame';
import { initLocalController } from '../game/localSession';

function HotSeat() {
  const [controller, setController] = useState<GameController | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    initLocalController()
      .then((c) => {
        if (alive) setController(c);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  if (error) {
    return (
      <Box data-testid="game-screen" sx={{ p: 3 }}>
        <Typography color="error">Couldn’t start the game: {error}</Typography>
      </Box>
    );
  }
  if (!controller) {
    return (
      <Box data-testid="game-screen" sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="loading game" />
      </Box>
    );
  }
  return (
    <Box data-testid="game-screen">
      <HotSeatGame controller={controller} />
    </Box>
  );
}

// Full mode only: the firestore-backed game container.
const MultiplayerGame =
  import.meta.env.VITE_LEX_MODE === 'full' ? lazy(() => import('../sync/MultiplayerGame')) : null;

export function Game() {
  const { id } = useParams<{ id: string }>();
  if (id === 'local') return <HotSeat />;
  if (id && MultiplayerGame) {
    return (
      <Box data-testid="game-screen">
        <Suspense fallback={null}>
          <MultiplayerGame gameId={id} />
        </Suspense>
      </Box>
    );
  }
  return (
    <Box data-testid="game-screen" sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Game
      </Typography>
      <Typography color="text.secondary">Online games need the multiplayer app.</Typography>
    </Box>
  );
}
