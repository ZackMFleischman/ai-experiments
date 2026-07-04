// Online games list container (T4.7): lazy-loaded by the Lobby in full mode.
import { Alert, CircularProgress, Stack } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LobbyView } from '../screens/lobbyView';
import { actionableCount, useTurnBadge } from '../screens/turnBadge';
import { useAuth } from './authContext';
import * as api from './gameApi';
import { useMyGames } from './lobby';
import { NotificationsSetup } from './NotificationsSetup';

export default function OnlineGames() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <NotificationsSetup />
      <Loaded uid={user.uid} onOpen={(id) => void navigate(`/game/${id}`)} />
    </Stack>
  );
}

function Loaded({ uid, onOpen }: { uid: string; onOpen: (id: string) => void }) {
  const { games, loading } = useMyGames(uid);
  const [error, setError] = useState<string | null>(null);
  useTurnBadge(actionableCount(games));
  if (loading) {
    return (
      <Stack alignItems="center" sx={{ mt: 4 }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }
  const respond = (id: string, accept: boolean) => {
    setError(null);
    api
      .respondChallenge({ gameId: id, accept })
      .then(() => {
        if (accept) onOpen(id); // straight into the fresh game
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'could not respond to the challenge');
      });
  };
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      <LobbyView games={games} now={Date.now()} onOpen={onOpen} onRespondChallenge={respond} />
    </>
  );
}
