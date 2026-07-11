// Game screen: /game/local is the hot-seat game; any other id is the lazy
// full-mode multiplayer container — the static hot-seat build drops that
// branch at build time (check-bundle).
import { Box, CircularProgress, Typography } from '@mui/material';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameScreen } from '../game/GameScreen';
import { createLocalSession, type CheckersSession } from '../game/localSession';

function HotSeat() {
  const navigate = useNavigate();
  const [session, setSession] = useState<CheckersSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    createLocalSession()
      .then((s) => {
        if (alive) setSession(s);
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
  if (!session) {
    return (
      <Box data-testid="game-screen" sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="loading game" />
      </Box>
    );
  }
  return (
    <Box data-testid="game-screen">
      <GameScreen
        session={session}
        mode={{ kind: 'hotseat' }}
        seatNames={[null, null]}
        onExit={() => void navigate('/lobby')}
      />
    </Box>
  );
}

// Full mode only: the firestore-backed game container.
const MultiplayerGame =
  import.meta.env.VITE_CHECKERS_MODE === 'full' ? lazy(() => import('../sync/MultiplayerGame')) : null;

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
