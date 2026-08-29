// Game screen: /game/local is the hot-seat game (T3.8), and /game/local/new
// its setup form; any other id is the lazy full-mode multiplayer container
// (T4.6/T4.7) — the static hot-seat build drops that branch at build time
// (T3.12 bundle check).
import { Box, CircularProgress, Typography } from '@mui/material';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GameController } from '../controller/GameController';
import { HotSeatGame } from '../game/HotSeatGame';
import { HotSeatSetup } from '../game/HotSeatSetup';
import {
  hasStoredGame,
  initLocalController,
  startLocalGame,
  type HotSeatChoices,
} from '../game/localSession';

/** The hot-seat setup form, wired to the local session (/game/local/new). */
export function HotSeatNew({
  onStarted,
}: {
  /** Set when HotSeat renders this form INLINE (nothing stored to resume):
   * navigating to /game/local from /game/local would be a no-op — same route,
   * no remount — so the caller is handed the controller instead. On the
   * /game/local/new route it is absent and the navigation does remount. */
  onStarted?: (controller: GameController) => void;
} = {}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only offer "keep playing" when there is actually a game to keep — on a
  // first visit the form IS the entry point and cancelling would go nowhere.
  const [resumable] = useState(() => hasStoredGame());
  const start = (choices: HotSeatChoices) => {
    setBusy(true);
    setError(null);
    startLocalGame(choices)
      .then((c) => {
        if (onStarted) onStarted(c);
        else void navigate('/game/local');
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
      });
  };
  return (
    <Box data-testid="game-screen">
      <HotSeatSetup
        onStart={start}
        busy={busy}
        error={error}
        {...(resumable ? { onCancel: () => void navigate('/game/local') } : {})}
      />
    </Box>
  );
}

function HotSeat() {
  const navigate = useNavigate();
  const [controller, setController] = useState<GameController | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Nothing stored = nothing to resume, so the setup form is the screen. A
  // stored game still resumes straight onto the board: the option pickers are
  // for STARTING a game, and options are immutable once one is under way.
  const [needsSetup, setNeedsSetup] = useState(() => !hasStoredGame());
  useEffect(() => {
    if (needsSetup) return;
    let alive = true;
    initLocalController()
      .then((c) => {
        if (alive) setController(c);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [needsSetup]);
  if (needsSetup) {
    return (
      <HotSeatNew
        onStarted={(c) => {
          setController(c);
          setNeedsSetup(false);
        }}
      />
    );
  }
  if (error) {
    return (
      <Box data-testid="game-screen" sx={{ p: 3 }}>
        <Typography color="error">Couldn’t start the game: {error}</Typography>
      </Box>
    );
  }
  if (!controller) {
    return (
      <Box data-testid="game-screen" sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="loading game" />
      </Box>
    );
  }
  return (
    <Box data-testid="game-screen">
      <HotSeatGame controller={controller} onNewGame={() => void navigate('/game/local/new')} />
    </Box>
  );
}

// Full mode only: the firestore-backed game container.
const MultiplayerGame =
  import.meta.env.VITE_LEX_MODE === 'full' ? lazy(() => import('../sync/MultiplayerGame')) : null;

export function Game() {
  const { id } = useParams<{ id: string }>();
  if (id === 'local') return <HotSeat />;
  if (id && MultiplayerGame) {
    return (
      <Box data-testid="game-screen">
        <Suspense fallback={null}>
          <MultiplayerGame gameId={id} />
        </Suspense>
      </Box>
    );
  }
  return (
    <Box data-testid="game-screen" sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Game
      </Typography>
      <Typography color="text.secondary">Online games need the multiplayer app.</Typography>
    </Box>
  );
}
