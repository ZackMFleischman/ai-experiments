// Multiplayer game container (T4.6): opens the FirestoreTransport, builds a
// perspective-locked GameController, renders the same GameScreen as hot-seat.
// Loaded lazily (full mode only) so the static build stays firebase-free.
import { Alert, Box, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import { GameController } from '../controller/GameController';
import { GameScreen } from '../game/GameScreen';
import { useAuth } from './authContext';
import { FirestoreTransport } from './firestoreTransport';

export default function MultiplayerGame({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const [controller, setController] = useState<GameController | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let built: GameController | undefined;
    const transport = new FirestoreTransport(gameId, user.uid);
    void transport
      .open()
      .then(async (info) => {
        built = new GameController(transport, info.options, info.myColor);
        await built.init();
        if (!cancelled) setController(built);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load game');
      });
    return () => {
      cancelled = true;
      built?.dispose();
    };
  }, [gameId, user]);

  if (error) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!controller) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  return <GameScreen controller={controller} />;
}
