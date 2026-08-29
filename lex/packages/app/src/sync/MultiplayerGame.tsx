// ported from hive/packages/app/src/sync/MultiplayerGame.tsx (adapted)
// Multiplayer game container (T4.6/T4.7): opens the FirestoreTransport, loads
// the game's dictionary, builds a perspective-locked GameController, renders
// the same GameBoard as hot-seat (no pass-device interstitial — each device
// only ever sees its own rack). While the game doc is still status:'open' the
// board is withheld — the host sees the shareable invite (or their outbound
// challenge), the challenged player an accept/decline card — and the screen
// flips to the live board the moment the seat fills. Loaded lazily (full mode
// only) so the static build stays firebase-free.
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { loadDictionary } from '@lex/dict';
import { RULESETS } from '@lex/engine';
import { useAuth } from '@parlor/web';
import {
  friendsFrom,
  GameRoom,
  hostOf,
  InvitationReceived,
  isHost,
  type GuestList,
  type TurnOrderChoice,
} from '@parlor/web/lobby-ui';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { GameController } from '../controller/GameController';
import { GameBoard } from '../board/GameBoard';
import { ChallengeReceived, WaitingForOpponent } from '../screens/waitingView';
import {
  canonicalBagOrder,
  FirestoreTransport,
  SEAT_KEYS,
  type GameMeta,
} from './firestoreTransport';
import * as api from './gameApi';
import { useLexGames } from './lobby';

export default function MultiplayerGame({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [controller, setController] = useState<GameController | null>(null);
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped after accepting a challenge: the first open() ran before we had a
  // seat and failed — re-run the whole init now that respondChallenge sat us.
  const [initNonce, setInitNonce] = useState(0);
  // Set when open() came back seatless: a 3+ room that has not started, where
  // there is nothing to build a board from YET. See the flip effect below.
  const seatless = useRef(false);

  useEffect(() => {
    if (!user) return;
    setController(null); // gameId changed (e.g. rematch): drop the old session
    setMeta(null);
    setError(null);
    let cancelled = false;
    let built: GameController | undefined;
    seatless.current = false;
    const transport = new FirestoreTransport(gameId, user.uid);
    const unwatch = transport.watchMeta((m) => {
      if (cancelled) return;
      if (m === null) setGone(true); // declined/withdrawn out from under us
      else setMeta(m);
    });
    void transport
      .open()
      .then(async (info) => {
        if (info.mySeat === null) {
          // A 3+ room before the start: no seats, no deal, no board. The room
          // screen renders off `meta`; the flip effect below builds the board
          // once the host starts and the seats exist.
          seatless.current = true;
          return;
        }
        const dict = await loadDictionary(info.options.dictionaryId);
        built = new GameController(
          transport,
          {
            rulesetId: info.options.rulesetId,
            dictionaryId: info.options.dictionaryId,
            invalidWords: info.options.invalidWords ?? 'blocked',
            bagOrder: canonicalBagOrder(info.options.rulesetId),
            // The deal decides the count; the first sync entry carries the real
            // one. Two until then — the board never renders before it lands.
            seats: info.options.maxPlayers ?? 2,
          },
          { dict },
          info.mySeat,
        );
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
  }, [gameId, user, initNonce]);

  // Realtime streams can die silently on mobile Safari (the push arrives but
  // the open board never moves). Two safety nets: resync when the tab becomes
  // visible again, and resync when the service worker relays a push for this
  // game to an already-open client (SW lands in T5.1).
  useEffect(() => {
    if (!controller) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void controller.resync();
    };
    const onSwMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; link?: string } | null;
      if (msg?.type === 'push-sync' && msg.link?.includes(`/game/${gameId}`)) {
        void controller.resync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [controller, gameId]);

  // The room started: the meta listener flips status to 'active' and the deal
  // now exists, so re-run init exactly once (the same trick the challenge-
  // accept path uses). Guarded by `seatless` so the two-seat path — where
  // open() always seats you — never re-inits.
  const status = meta?.status;
  useEffect(() => {
    if (status === 'active' && seatless.current) {
      seatless.current = false;
      setInitNonce((n) => n + 1);
    }
  }, [status]);

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
  // No opponent yet: never hand the player an actable board (the server would
  // reject the move anyway — and the rack stays private until seated, §8.10).
  if (meta?.status === 'open') {
    // Three or four seats: a guest-list ROOM, not a two-player waiting screen.
    // Everything below this branch is the untouched two-seat path.
    if ((meta.maxPlayers ?? 2) >= 3 && user) {
      return <RoomScreen gameId={gameId} meta={meta} uid={user.uid} onGone={() => void navigate('/lobby')} />;
    }
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
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <GameBoard
        controller={controller}
        seatNames={SEAT_KEYS.filter((key) => key in meta.playerNames).map(
          (key, seat) => meta.playerNames[key] ?? `Player ${seat + 1}`,
        )}
        onRematch={rematch}
        onBackToLobby={() => void navigate('/lobby')}
        timeControl={meta.timeControl}
        {...(meta.deadlineAtMs !== undefined ? { deadlineAtMs: meta.deadlineAtMs } : {})}
      />
    </Box>
  );
}

/**
 * The 3+ pre-start room (DECISIONS 2026-08-28): the guest list, the turn order
 * everyone can see, and the host's start. Its own component so the room's state
 * and its lobby listener never mount on the two-seat path.
 */
function RoomScreen({
  gameId,
  meta,
  uid,
  onGone,
}: {
  gameId: string;
  meta: GameMeta;
  uid: string;
  /** The room stopped being ours — cancelled, declined, or left. */
  onGone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The host's picker is optimistic: setTurnOrder is a round trip and the
  // toggles must not lag a thumb. Everyone else reads the doc.
  const [pendingOrder, setPendingOrder] = useState<TurnOrderChoice | null>(null);

  const list: GuestList = {
    roster: meta.roster ?? [],
    invited: meta.invited ?? [],
    declined: meta.declined ?? [],
  };
  const maxPlayers = meta.maxPlayers ?? 2;
  // The seat range is the SELECTED ruleset's, not the registry union's.
  const minPlayers = RULESETS[meta.rulesetId]?.players.min ?? 2;
  const turnOrder = pendingOrder ?? meta.turnOrder ?? { mode: 'random' as const };

  const run = (work: Promise<unknown>, whenFailed: string, then?: () => void) => {
    setError(null);
    setBusy(true);
    work
      .then(() => then?.())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : whenFailed))
      .finally(() => setBusy(false));
  };

  const alert = error && (
    <Alert severity="error" sx={{ position: 'fixed', top: 8, left: 8, right: 8, zIndex: 1 }}>
      {error}
    </Alert>
  );

  // Asked but not yet in: the invitee's side. Accepting takes a seat if one is
  // still there — an invitation reserves nothing.
  if (!list.roster.some((e) => e.uid === uid) && list.invited.some((e) => e.uid === uid)) {
    return (
      <>
        {alert}
        <InvitationReceived
          hostName={hostOf(list)?.name ?? 'A friend'}
          names={list.roster.map((e) => e.name)}
          filled={list.roster.length}
          maxPlayers={maxPlayers}
          busy={busy}
          blurb="Take a seat now — your rack is dealt when the host starts."
          onRespond={(accept) =>
            run(api.respondInvite({ gameId, accept }), 'could not answer the invitation', () => {
              if (!accept) onGone();
            })
          }
        />
      </>
    );
  }

  return (
    <>
      {alert}
      <GameRoom
        list={list}
        myUid={uid}
        minPlayers={minPlayers}
        maxPlayers={maxPlayers}
        {...(meta.inviteCode ? { code: meta.inviteCode } : {})}
        turnOrder={turnOrder}
        busy={busy}
        onTurnOrderChange={(value) => {
          setPendingOrder(value);
          run(api.setTurnOrder({ gameId, turnOrder: value }), 'could not set the turn order');
        }}
        onStart={(expectedRoster) =>
          run(api.startGame({ gameId, expectedRoster }), 'could not start the game')
        }
        onLeave={() => run(api.leaveGame({ gameId }), 'could not leave the game', onGone)}
        onCancel={() => run(api.cancelGame({ gameId }), 'could not cancel the game', onGone)}
        {...(isHost(list, uid)
          ? { invitePicker: <RoomInvitePicker gameId={gameId} uid={uid} list={list} onError={setError} /> }
          : {})}
      />
    </>
  );
}

/** Lex's own friend picker for the room: past opponents, minus anyone already
 *  in, asked, or gone. Recruiting is additive — the code stays live too. */
function RoomInvitePicker({
  gameId,
  uid,
  list,
  onError,
}: {
  gameId: string;
  uid: string;
  list: GuestList;
  onError: (message: string) => void;
}) {
  const { games } = useLexGames(uid);
  // Optimistic: the chip disappears on the tap, and comes back if the call did
  // not land (the doc's `invited` takes over on the next snapshot).
  const [asked, setAsked] = useState<readonly string[]>([]);
  const taken = new Set([
    ...list.roster.map((e) => e.uid),
    ...list.invited.map((e) => e.uid),
    ...list.declined.map((e) => e.uid),
    ...asked,
  ]);
  const friends = friendsFrom(games).filter((f) => !taken.has(f.uid));
  if (friends.length === 0) return null;
  return (
    <Stack spacing={1} data-testid="room-invite-friends">
      <Typography variant="overline" color="text.secondary">
        Invite a past opponent
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {friends.map((friend) => (
          <Chip
            key={friend.uid}
            label={friend.name}
            variant="outlined"
            data-testid={`room-invite-${friend.uid}`}
            onClick={() => {
              setAsked((a) => [...a, friend.uid]);
              api.invitePlayers({ gameId, uids: [friend.uid] }).catch((err: unknown) => {
                setAsked((a) => a.filter((x) => x !== friend.uid));
                onError(err instanceof Error ? err.message : 'could not send the invitation');
              });
            }}
          />
        ))}
      </Stack>
    </Stack>
  );
}
