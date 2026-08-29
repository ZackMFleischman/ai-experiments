// ported from hive/packages/app/src/sync/NewGameFlow.tsx (adapted)
// New-game flow container (T4.7): create via callable, then show the invite
// link — or, when a past opponent is picked, send a direct challenge and jump
// straight to the game (DESIGN §6.3). Lazy-loaded by the NewGame screen in
// full mode.
import { Alert, Stack } from '@mui/material';
import { useAuth } from '@parlor/web';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  InviteLinkView,
  NewGameForm,
  friendsFrom,
  type NewGameChoices,
} from '../screens/newGameView';
import * as api from './gameApi';
import { useLexGames } from './lobby';

export default function NewGameFlow() {
  const { user } = useAuth();
  if (!user) return null; // /new sits behind RequireAuth
  return <Flow uid={user.uid} />;
}

function Flow({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const { games } = useLexGames(uid);
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
      : api.createGame({ options, seat }).then((created) => {
          // At three or four seats the created game IS a room, and the room
          // screen already carries the code and the friend picker — a separate
          // post-create invite step would be a detour. Two seats keep the
          // invite-link view exactly as it has always been.
          if ((options.maxPlayers ?? 2) >= 3) void navigate(`/game/${created.gameId}`);
          else setCreated(created);
        })
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
