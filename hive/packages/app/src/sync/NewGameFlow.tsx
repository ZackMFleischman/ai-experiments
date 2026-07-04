// New-game flow container (T4.7): create via callable, then show the invite
// link — or, when a past opponent is picked, send a direct challenge and jump
// straight to the game (DESIGN §5.3). Lazy-loaded by the NewGame screen in
// full mode.
import { Alert, Stack } from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  InviteLinkView,
  NewGameForm,
  friendsFrom,
  type NewGameChoices,
} from '../screens/newGameView';
import { useAuth } from './authContext';
import * as api from './gameApi';
import { useMyGames } from './lobby';

export default function NewGameFlow() {
  const { user } = useAuth();
  if (!user) return null; // /new sits behind RequireAuth
  return <Flow uid={user.uid} />;
}

function Flow({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const { games } = useMyGames(uid);
  const friends = useMemo(() => friendsFrom(games), [games]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ gameId: string; code: string } | null>(null);

  if (created) {
    return (
      <InviteLinkView
        code={created.code}
        gameId={created.gameId}
        onOpenGame={(id) => void navigate(`/game/${id}`)}
      />
    );
  }

  const create = (choices: NewGameChoices) => {
    setBusy(true);
    setError(null);
    const { opponent, ...rest } = choices;
    (opponent
      ? api
          .challengeUser({ opponentUid: opponent.uid, ...rest })
          .then(({ gameId }) => void navigate(`/game/${gameId}`))
      : api.createGame(rest).then(setCreated)
    )
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'failed to create the game');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <NewGameForm onCreate={create} busy={busy} friends={friends} />
    </Stack>
  );
}
