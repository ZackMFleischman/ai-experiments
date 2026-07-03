// New-game flow container (T4.7): create via callable, then show the invite
// link. Lazy-loaded by the NewGame screen in full mode.
import { Alert, Stack } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InviteLinkView, NewGameForm, type NewGameChoices } from '../screens/newGameView';
import * as api from './gameApi';

export default function NewGameFlow() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ gameId: string; code: string } | null>(null);

  if (created) {
    return (
      <InviteLinkView
        url={`${window.location.origin}/join/${created.code}`}
        gameId={created.gameId}
        onOpenGame={(id) => void navigate(`/game/${id}`)}
      />
    );
  }

  const create = (choices: NewGameChoices) => {
    setBusy(true);
    setError(null);
    api
      .createGame(choices)
      .then(setCreated)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'failed to create the game');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <NewGameForm onCreate={create} busy={busy} />
    </Stack>
  );
}
