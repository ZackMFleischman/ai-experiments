// The sit: a draining ring, mm:ss, pause/resume — and the three native
// capabilities this app exists to exercise (BRAND-IMPLEMENTATION.md 3c):
// keep-awake while running, a local notification as the backgrounded bell,
// and (M2, once the BackgroundAudio plugin lands) ambient sound. All of it
// no-ops on the free web build (the Phase-3a bridge discipline); the
// foreground bell is synthesized WebAudio either way.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AppShell } from '@parlor/brand';
import {
  allowSleep,
  cancelNotification,
  hapticNotification,
  isNative,
  keepAwake,
  requestNotificationPermission,
  requestReview,
  scheduleNotification,
  shareContent,
} from '@parlor/native';
import { dayKey } from '@parlor/solo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../App';
import { ringBell } from '../timer/bell';
import {
  elapsedMs,
  formatRemaining,
  isDone,
  pauseSit,
  remainingMs,
  resumeSit,
  startSit,
} from '../timer/timer';

const BELL_NOTIFICATION_ID = 1;

export function Sit({ fixture }: { fixture?: 'paused' | 'done' } = {}) {
  const { stats } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const minutes = clampMinutes(Number(params.get('m')));
  const durationMs = minutes * 60_000;

  // `fixture` exists for the dev gallery only: paused/done are interior
  // states the registry can't reach through props otherwise.
  const [timer, setTimer] = useState(() => {
    const t = startSit(fixture === 'done' ? 0 : durationMs, Date.now());
    return fixture === 'paused' ? pauseSit(t, Date.now()) : t;
  });
  const [now, setNow] = useState(() => Date.now());
  const paused = timer.pausedAt !== null;
  const done = isDone(timer, now);

  // The interval only refreshes the display; remaining time is arithmetic
  // over Date.now(), so throttled ticks can't drift the clock (timer.ts).
  useEffect(() => {
    if (paused || done) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [paused, done]);

  // Ask once, lazily, at the moment it matters (native no-op on web).
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  // Running phase: keep the screen awake and park the bell in the OS —
  // scheduled 1s past the true end so a foreground finish (which cancels it)
  // wins the race and only a backgrounded phone hears the system chime.
  useEffect(() => {
    if (paused || done) return;
    void keepAwake();
    void scheduleNotification({
      id: BELL_NOTIFICATION_ID,
      title: 'Stillness',
      body: `That's it — ${minutes} minutes.`,
      at: new Date(Date.now() + remainingMs(timer, Date.now()) + 1000),
    });
    return () => {
      void allowSleep();
      void cancelNotification(BELL_NOTIFICATION_ID);
    };
  }, [paused, done, timer, minutes]);

  // Completion, exactly once: bell, success tap, record the sit (the time
  // actually sat — an early End counts for what it was), and from the third
  // sit on let the OS decide about the rating prompt.
  const completed = useRef(false);
  useEffect(() => {
    if (!done || completed.current) return;
    completed.current = true;
    ringBell();
    void hapticNotification('success');
    const today = dayKey(new Date());
    stats.record({ day: today, durationMs: elapsedMs(timer, now), won: true, bucket: 'sit' });
    if (stats.summary(today).won >= 3) void requestReview();
  }, [done, timer, now, stats]);

  const progress = useMemo(
    () => 1 - remainingMs(timer, now) / durationMs,
    [timer, now, durationMs],
  );

  if (done) {
    // now froze when the interval stopped, so this is the time actually sat.
    const satMinutes = Math.max(1, Math.round(elapsedMs(timer, now) / 60_000));
    return (
      <AppShell title="Stillness">
        <Stack spacing={3} alignItems="center" sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="h2" component="p">
            That&apos;s it.
          </Typography>
          <Typography color="text.secondary">
            {satMinutes} quiet {satMinutes === 1 ? 'minute' : 'minutes'}.
          </Typography>
          <Stack direction="row" spacing={1}>
            {isNative() && (
              <Button
                onClick={() =>
                  void shareContent({
                    title: 'Stillness',
                    text: `Sat for ${satMinutes} quiet ${satMinutes === 1 ? 'minute' : 'minutes'}.`,
                    url: 'https://stillness-zmf.pages.dev',
                  })
                }
              >
                Share
              </Button>
            )}
            <Button variant="contained" onClick={() => navigate('/')}>
              Done
            </Button>
          </Stack>
        </Stack>
      </AppShell>
    );
  }

  return (
    <AppShell title={`${minutes} minutes`} onBack={() => navigate('/')}>
      <Stack spacing={4} alignItems="center" sx={{ mt: 6 }}>
        <Box sx={{ position: 'relative', width: 240, height: 240 }}>
          <ProgressRing progress={progress} />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Typography
              variant="h1"
              component="p"
              role="timer"
              aria-label="time remaining"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatRemaining(timer, now)}
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() => setTimer((t) => (paused ? resumeSit(t, Date.now()) : pauseSit(t, Date.now())))}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            color="inherit"
            onClick={() => setTimer((t) => ({ ...t, durationMs: 0 }))}
            aria-label="end the sit now"
          >
            End
          </Button>
        </Stack>
      </Stack>
    </AppShell>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 240 240" width="240" height="240" aria-hidden>
      <circle cx="120" cy="120" r={radius} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.15" />
      <circle
        cx="120"
        cy="120"
        r={radius}
        fill="none"
        stroke="#4e7d5b"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * Math.min(1, Math.max(0, progress))}
        transform="rotate(-90 120 120)"
      />
    </svg>
  );
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 10;
  return Math.min(180, Math.round(value));
}
