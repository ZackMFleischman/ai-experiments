// Multiplayer game container (T4.6): opens the FirestoreTransport, builds a
// perspective-locked GameController, renders the same GameScreen as hot-seat.
// While the game doc is still status:'open' the board is withheld — a waiting
// screen keeps the invite (link + code) shareable and flips to the live board
// the moment the opponent joins. Loaded lazily (full mode only) so the static
// build stays firebase-free.
import { Alert, Box, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameController } from '../controller/GameController';
import { GameScreen } from '../game/GameScreen';
import { WaitingForOpponent } from '../screens/waitingView';
import { useAuth } from './authContext';
import { FirestoreTransport, type GameMeta } from './firestoreTransport';
import * as api from './gameApi';

export default function MultiplayerGame({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [controller, setController] = useState<GameController | null>(null);
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setController(null); // gameId changed (e.g. rematch): drop the old session
    setMeta(null);
    setError(null);
    let cancelled = false;
    let built: GameController | undefined;
    const transport = new FirestoreTransport(gameId, user.uid);
    const unwatch = transport.watchMeta((m) => {
      if (!cancelled) setMeta(m);
    });
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
      unwatch();
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
  // No opponent yet: never hand the player an actable board (the server would
  // reject the move anyway) — show the shareable invite instead.
  if (meta?.status === 'open') {
    return <WaitingForOpponent code={meta.inviteCode} />;
  }
  if (!controller || !meta) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  const rematch = () => {
    void api
      .rematch({ gameId })
      .then(({ gameId: next }) => void navigate(`/game/${next}`))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'rematch failed');
      });
  };
  return (
    <GameScreen controller={controller} playerNames={meta.playerNames} onRematch={rematch} />
  );
}
