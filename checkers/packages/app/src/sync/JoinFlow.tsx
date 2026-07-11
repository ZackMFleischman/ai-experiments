// Join flow container: look up the invite (readable by any signed-in holder
// of the code — firestore.rules), render the summary card, claim the seat
// through the joinGame callable. Lazy-loaded in full mode.
import { doc, getDoc } from 'firebase/firestore';
import { Alert, Stack } from '@mui/material';
import { getDb } from '@parlor/web/firebase';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JoinCard, type JoinState } from '../screens/Join';
import type { CheckersGameOptions } from '../gameOptions';
import * as api from './gameApi';

interface InviteDoc {
  gameId: string;
  hostName: string;
  hostSeat: 'dark' | 'light';
  options: CheckersGameOptions;
  expiresAt: { toMillis(): number };
}

export default function JoinFlow({ code }: { code: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<JoinState>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(getDb(), 'invites', code))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setState({ kind: 'invalid' });
          return;
        }
        const inv = snap.data() as InviteDoc;
        if (inv.expiresAt.toMillis() < Date.now()) {
          setState({ kind: 'invalid' });
          return;
        }
        setState({
          kind: 'ready',
          hostName: inv.hostName,
          hostSeat: inv.hostSeat,
          options: inv.options,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'invalid' });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const accept = () => {
    setError(null);
    api
      .joinGame({ code })
      .then(({ gameId }) => void navigate(`/game/${gameId}`))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'could not join the game');
      });
  };

  return (
    <Stack spacing={2} sx={{ width: '100%' }}>
      {error && <Alert severity="error">{error}</Alert>}
      <JoinCard state={state} onAccept={accept} />
    </Stack>
  );
}
