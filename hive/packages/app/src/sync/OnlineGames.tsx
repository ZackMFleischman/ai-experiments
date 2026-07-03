// Online games list container (T4.7): lazy-loaded by the Lobby in full mode.
import { CircularProgress, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { LobbyView } from '../screens/lobbyView';
import { useAuth } from './authContext';
import { useMyGames } from './lobby';

export default function OnlineGames() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return <Loaded uid={user.uid} onOpen={(id) => void navigate(`/game/${id}`)} />;
}

function Loaded({ uid, onOpen }: { uid: string; onOpen: (id: string) => void }) {
  const { games, loading } = useMyGames(uid);
  if (loading) {
    return (
      <Stack alignItems="center" sx={{ mt: 4 }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }
  return <LobbyView games={games} now={Date.now()} onOpen={onOpen} />;
}
