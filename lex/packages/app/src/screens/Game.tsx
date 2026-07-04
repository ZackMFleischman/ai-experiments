// Game screen: /game/local is the hot-seat game (T3.8); multiplayer ids
// arrive with M4 (firestoreTransport, T4.6).
import { Box, CircularProgress, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
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

export function Game() {
  const { id } = useParams<{ id: string }>();
  if (id === 'local') return <HotSeat />;
  return (
    <Box data-testid="game-screen" sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Game
      </Typography>
      <Typography color="text.secondary">Online game {id} — multiplayer lands in M4.</Typography>
    </Box>
  );
}
