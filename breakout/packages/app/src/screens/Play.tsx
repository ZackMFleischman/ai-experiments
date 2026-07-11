// The court: a canvas driven by @parlor/arcade's fixed loop over the pure
// engine fold. React owns only the HUD and dialogs — game state lives in a
// ref and never re-renders per tick. A gallery fixture renders one frozen
// frame (no loop, no listeners) so captures are deterministic.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { AppShell } from '@parlor/brand';
import {
  InputQueue,
  createFixedLoop,
  fitCanvas,
  pauseWhenHidden,
  trackHeldKeys,
  trackPointer,
} from '@parlor/arcade';
import {
  hapticImpact,
  hapticNotification,
  isNative,
  requestReview,
  shareContent,
} from '@parlor/native';
import { dayKey } from '@parlor/solo';
import {
  WORLD,
  advance,
  initBreakout,
  type BreakoutAction,
  type BreakoutState,
} from '@breakout/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { drawGame, type CourtPalette } from '../game/draw';
import { newGameOptions } from '../game/seed';
import { useApp } from '../App';

const STEP_MS = 1000 / WORLD.ticksPerSecond;
const OVERS_KEY = 'breakout:overs';

interface Hud {
  score: number;
  lives: number;
  level: number;
  phase: BreakoutState['phase'];
}

const hudOf = (s: BreakoutState): Hud => ({
  score: s.score,
  lives: s.lives,
  level: s.level,
  phase: s.phase,
});

export interface PlayProps {
  /** Gallery fixture: render this state frozen — no loop, no input. */
  fixture?: BreakoutState;
}

export function Play({ fixture }: PlayProps) {
  const { scores, storage } = useApp();
  const navigate = useNavigate();
  const theme = useTheme();
  const frozen = fixture !== undefined;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const courtRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<BreakoutState | null>(fixture ?? null);
  if (stateRef.current === null) stateRef.current = initBreakout(newGameOptions());
  const queueRef = useRef(new InputQueue<BreakoutAction>());

  const [hud, setHud] = useState<Hud>(() => hudOf(stateRef.current as BreakoutState));
  const [paused, setPaused] = useState(false);
  // A frozen game-over fixture shows the dialog too (gallery captures it).
  const [over, setOver] = useState<{ score: number; newBest: boolean } | null>(() =>
    fixture && fixture.phase === 'game-over' ? { score: fixture.score, newBest: false } : null,
  );

  const palette = useMemo<CourtPalette>(
    () => ({
      paper: theme.palette.background.default,
      court: theme.palette.mode === 'dark' ? '#1b1b1f' : '#efece3',
      ink: theme.palette.text.primary,
      accent: theme.palette.primary.main,
    }),
    [theme],
  );
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const pauseRef = useRef<((pause: boolean) => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const court = courtRef.current;
    if (!canvas || !court) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const rect = court.getBoundingClientRect();
      const { pixelWidth, pixelHeight } = fitCanvas(
        canvas,
        rect.width,
        rect.height,
        window.devicePixelRatio || 1,
      );
      drawGame(ctx, stateRef.current as BreakoutState, pixelWidth, pixelHeight, paletteRef.current);
    };

    if (frozen) {
      // One deterministic frame; re-drawn if the container resizes.
      draw();
      const observer = new ResizeObserver(draw);
      observer.observe(court);
      return () => observer.disconnect();
    }

    const recordGameOver = (finished: BreakoutState) => {
      const newBest = scores.record({ score: finished.score, day: dayKey(new Date()) });
      setOver({ score: finished.score, newBest });
      // Native polish (Apple 4.2 defense, no-ops on web): a heavier tap on
      // the end, and from the third finished game on, let the OS decide
      // whether to show the rating prompt (fire-and-forget).
      void hapticNotification('success');
      const overs = Number(storage.getItem(OVERS_KEY) ?? '0') + 1;
      try {
        storage.setItem(OVERS_KEY, String(overs));
      } catch {
        // counter just won't advance
      }
      if (overs >= 3) void requestReview();
    };

    const held = trackHeldKeys(window, ['ArrowLeft', 'ArrowRight']);
    let lastDir = 0;

    const loop = createFixedLoop({
      stepMs: STEP_MS,
      update() {
        const dir = (held.isDown('ArrowRight') ? 1 : 0) - (held.isDown('ArrowLeft') ? 1 : 0);
        if (dir !== lastDir) {
          lastDir = dir;
          queueRef.current.push({ t: 'move', dir: dir as -1 | 0 | 1 });
        }
        const previous = stateRef.current as BreakoutState;
        const next = advance(previous, queueRef.current.drain());
        stateRef.current = next;
        if (next.phase !== previous.phase) {
          if (next.phase === 'live') void hapticImpact('light');
          if (next.phase === 'level-cleared') void hapticNotification('success');
          if (next.phase === 'game-over') recordGameOver(next);
          setHud(hudOf(next));
        } else if (
          next.score !== previous.score ||
          next.lives !== previous.lives ||
          next.level !== previous.level
        ) {
          setHud(hudOf(next));
        }
      },
      render: draw,
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!pausedRef.current) queueRef.current.push({ t: 'serve' });
      }
    };
    window.addEventListener('keydown', onKey);

    const untrackPointer = trackPointer(canvas, (x) => {
      if (!pausedRef.current) queueRef.current.push({ t: 'target', x: x * WORLD.width });
    });
    const onPointerDown = () => {
      // A tap on a paused court is "resume", never a hidden serve.
      if (pausedRef.current) pauseRef.current?.(false);
      else queueRef.current.push({ t: 'serve' });
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    const unwatchVisibility = pauseWhenHidden(
      {
        pause() {
          loop.pause();
          setPaused(true);
        },
      },
      document,
    );

    const observer = new ResizeObserver(draw);
    observer.observe(court);
    loop.start();

    const pauseControl = (pause: boolean) => {
      if (pause) loop.pause();
      else loop.resume();
      setPaused(pause);
    };
    pauseRef.current = pauseControl;

    return () => {
      loop.stop();
      held.dispose();
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointerDown);
      untrackPointer();
      unwatchVisibility();
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen, scores, storage]);

  const best = scores.best()?.score ?? 0;
  const serving = hud.phase === 'serving' || hud.phase === 'level-cleared';

  return (
    <AppShell
      title="Bricks"
      onBack={() => navigate('/')}
      actions={
        !frozen && !over ? (
          <Button size="small" color="inherit" onClick={() => pauseRef.current?.(!paused)}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
        ) : null
      }
      fullBleed
    >
      <Stack sx={{ flex: 1, minHeight: 0, px: 1.5, pb: 1.5, pt: 0.5, maxWidth: 560, width: '100%', mx: 'auto' }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="baseline"
          data-hud
          sx={{ px: 0.5, pb: 0.5 }}
        >
          <Typography variant="subtitle1" component="p" fontWeight={600} data-hud-score>
            {hud.score}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            level {hud.level} · best {Math.max(best, hud.score)}
          </Typography>
          <Typography variant="body2" color="text.secondary" aria-label={`${hud.lives} balls left`}>
            {'●'.repeat(Math.max(0, hud.lives))}
          </Typography>
        </Stack>
        <Box ref={courtRef} sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <canvas
            ref={canvasRef}
            aria-label="bricks court"
            style={{ position: 'absolute', inset: 0, touchAction: 'none', display: 'block' }}
          />
          {(serving || paused) && !over && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <Typography
                variant="body1"
                sx={{
                  px: 2,
                  py: 0.75,
                  borderRadius: 3,
                  bgcolor: 'background.paper',
                  boxShadow: 1,
                }}
              >
                {paused
                  ? 'Paused'
                  : hud.phase === 'level-cleared'
                    ? `Level ${hud.level} cleared — tap to keep going`
                    : 'Tap to serve'}
              </Typography>
            </Box>
          )}
        </Box>
      </Stack>

      <Dialog open={over !== null} aria-labelledby="over-title">
        <DialogTitle id="over-title">{over?.newBest ? 'New best!' : 'Game over'}</DialogTitle>
        <DialogContent>
          <Typography>
            {over?.newBest
              ? `${over.score} points — your best yet.`
              : `${over?.score ?? 0} points. Best is ${best}.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          {isNative() && (
            <Button
              onClick={() =>
                void shareContent({
                  title: 'Bricks',
                  text: `Scored ${over?.score ?? 0} in Bricks.`,
                  url: 'https://breakout-zmf.pages.dev',
                })
              }
            >
              Share
            </Button>
          )}
          <Button
            onClick={() => {
              stateRef.current = initBreakout(newGameOptions());
              setOver(null);
              setHud(hudOf(stateRef.current));
            }}
          >
            Play again
          </Button>
          <Button onClick={() => navigate('/')}>Done</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
