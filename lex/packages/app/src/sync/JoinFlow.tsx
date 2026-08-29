// ported from hive/packages/app/src/sync/JoinFlow.tsx (adapted)
// Join flow container (T4.7): look up the invite (readable by any signed-in
// holder of the code — firestore.rules), render the FR-10 summary card, claim
// the seat through the joinGame callable. Lazy-loaded in full mode.
import { doc, getDoc } from 'firebase/firestore';
import { Alert, Stack } from '@mui/material';
import { getDb } from '@parlor/web/firebase';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JoinCard, type JoinState } from '../screens/Join';
import type { LexGameOptions } from '../gameOptions';
import * as api from './gameApi';

interface InviteDoc {
  gameId: string;
  hostName: string;
  /** Two-seat invites only — at 3+ nobody has a seat until the host starts. */
  hostSeat?: 'p0' | 'p1';
  options: LexGameOptions;
  expiresAt: { toMillis(): number };
  /** Written by a 3+ room and kept fresh as people join (parlor's
   * `previewOf`). Uid-free: invites/{code} is readable by anyone signed in. */
  preview?: { hostName: string; names: readonly string[]; filled: number; maxPlayers: number };
}

/** The room is gone as a place to sit, but the code was never wrong. */
const FULL_RE = /full|already started/i;

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
        const preview = inv.preview;
        if (preview) {
          // A 3+ room: the guest list, or 'closed' once the places are gone.
          setState(
            preview.filled >= preview.maxPlayers
              ? { kind: 'closed' }
              : { kind: 'room', ...preview, options: inv.options },
          );
          return;
        }
        setState({
          kind: 'ready',
          hostName: inv.hostName,
          // Every two-seat invite carries a seat; the fallback is unreachable.
          hostSeat: inv.hostSeat ?? 'p0',
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
        const message = err instanceof Error ? err.message : 'could not join the game';
        // Somebody else took the last place, or the host started while this
        // card was open: that is a closed room, not a broken invite.
        if (FULL_RE.test(message)) setState({ kind: 'closed' });
        else setError(message);
      });
  };

  return (
    <Stack spacing={2} sx={{ width: '100%' }}>
      {error && <Alert severity="error">{error}</Alert>}
      <JoinCard state={state} onAccept={accept} />
    </Stack>
  );
}
