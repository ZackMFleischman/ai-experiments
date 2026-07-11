// Multiplayer game container: opens the FirestoreTransport, builds a
// perspective-locked LogSession, renders the same GameScreen as hot-seat.
// While the game doc is still status:'open' the board is withheld — the
// host sees the shareable invite (or their outbound challenge), the
// challenged player an accept/decline card — and the screen flips to the
// live board the moment the seat fills. Loaded lazily (full mode only) so
// the static build stays firebase-free.
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { LogSession } from '@parlor/core';
import { useAuth } from '@parlor/web';
import { ChallengeReceived, WaitingForOpponent } from '@parlor/web/lobby-ui';
import type { Side, CheckersState } from '@checkers/engine';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { CheckersGameOptions } from '../gameOptions';
import { sessionConfig, type CheckersEntry } from '../game/entries';
import { GameScreen } from '../game/GameScreen';
import { FirestoreTransport, type GameMeta } from './firestoreTransport';
import * as api from './gameApi';

type Session = LogSession<CheckersGameOptions, CheckersEntry, CheckersState>;

export default function MultiplayerGame({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<{ session: Session; mySide: Side } | null>(null);
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped after accepting a challenge: the first open() ran before we had a
  // seat and failed — re-run the whole init now that respondChallenge sat us.
  const [initNonce, setInitNonce] = useState(0);

  useEffect(() => {
    if (!user) return;
    setSession(null); // gameId changed (e.g. rematch): drop the old session
    setMeta(null);
    setError(null);
    let cancelled = false;
    let built: Session | undefined;
    const transport = new FirestoreTransport(gameId, user.uid);
    const unwatch = transport.watchMeta((m) => {
      if (cancelled) return;
      if (m === null) setGone(true); // declined/withdrawn out from under us
      else setMeta(m);
    });
    void transport
      .open()
      .then(async (info) => {
        built = new LogSession(transport, sessionConfig);
        await built.init();
        if (!cancelled) setSession({ session: built, mySide: info.mySide });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load game');
      });
    return () => {
      cancelled = true;
      unwatch();
      built?.dispose();
    };
  }, [gameId, user, initNonce]);

  // Realtime streams can die silently on mobile Safari. Two safety nets:
  // resync when the tab becomes visible again, and resync when the service
  // worker relays a push for this game to an already-open client.
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void session.session.resync();
    };
    const onSwMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; link?: string } | null;
      if (msg?.type === 'push-sync' && msg.link?.includes(`/game/${gameId}`)) {
        void session.session.resync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [session, gameId]);

  if (gone) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
        <Card sx={{ width: '100%', maxWidth: 440 }} data-testid="game-gone">
          <CardContent>
            <Stack spacing={2} alignItems="center" sx={{ py: 1 }}>
              <Typography variant="h6" component="h2">
                This game is gone
              </Typography>
              <Typography color="text.secondary" align="center">
                The challenge was declined or withdrawn.
              </Typography>
              <Button component={RouterLink} to="/lobby" startIcon={<ArrowBackIcon />}>
                Back to lobby
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }
  // No opponent yet: never hand the player an actable board (the server
  // would reject the move anyway).
  if (meta?.status === 'open') {
    const alert = actionError && (
      <Alert severity="error" sx={{ position: 'fixed', top: 8, left: 8, right: 8, zIndex: 1 }}>
        {actionError}
      </Alert>
    );
    if (meta.challenge && user && meta.challenge.to === user.uid) {
      const respond = (accept: boolean) => {
        setActionError(null);
        setBusy(true);
        api
          .respondChallenge({ gameId, accept })
          .then(() => {
            if (accept) setInitNonce((n) => n + 1); // now seated: build the board
            else void navigate('/lobby');
          })
          .catch((err: unknown) => {
            setActionError(err instanceof Error ? err.message : 'could not respond');
          })
          .finally(() => setBusy(false));
      };
      return (
        <>
          {alert}
          <ChallengeReceived name={meta.challenge.fromName} onRespond={respond} busy={busy} />
        </>
      );
    }
    const cancel = () => {
      setActionError(null);
      void api
        .cancelGame({ gameId })
        .then(() => void navigate('/lobby'))
        .catch((err: unknown) => {
          setActionError(err instanceof Error ? err.message : 'could not cancel the game');
        });
    };
    return (
      <>
        {alert}
        <WaitingForOpponent
          code={meta.inviteCode}
          challengeName={meta.challenge?.toName}
          onCancel={cancel}
        />
      </>
    );
  }
  if (error) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!session || !meta) {
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
    <GameScreen
      session={session.session}
      mode={{ kind: 'online', mySide: session.mySide }}
      seatNames={[meta.playerNames.attackers, meta.playerNames.defenders]}
      onExit={() => void navigate('/lobby')}
      onRematch={rematch}
    />
  );
}
