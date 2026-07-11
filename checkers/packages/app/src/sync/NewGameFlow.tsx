// New-game flow container: create via callable, then show the invite link —
// or, when a past opponent is picked, send a direct challenge and jump
// straight to the game. Lazy-loaded by the NewGame screen in full mode.
import { Alert, Stack } from '@mui/material';
import { useAuth } from '@parlor/web';
import { InviteLinkView, friendsFrom } from '@parlor/web/lobby-ui';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NewGameForm, type NewGameChoices } from '../screens/NewGame';
import * as api from './gameApi';
import { useCheckersGames } from './lobby';

export default function NewGameFlow() {
  const { user } = useAuth();
  if (!user) return null; // /new sits behind RequireAuth
  return <Flow uid={user.uid} />;
}

function Flow({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const { games } = useCheckersGames(uid);
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
    const { opponent, options, seat } = choices;
    (opponent
      ? api
          .challengeUser({ opponentUid: opponent.uid, options, seat })
          .then(({ gameId }) => void navigate(`/game/${gameId}`))
      : api.createGame({ options, seat }).then(setCreated)
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
