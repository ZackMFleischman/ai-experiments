// ported from hive/packages/app/src/screens/LandingLayout.tsx + Landing.tsx (adapted)
// The shared landing: the themed hero layout (a floating game vignette + the
// wordmark + tagline, with the screen's action as children — shared by Landing
// and Join so an invited friend sees the same identity), and the Landing screen
// itself (full-mode Google sign-in + emulator test form, or the hot-seat
// buttons). The hero vignette is the one game-specific slot. Firebase-free.
import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import GoogleIcon from '@mui/icons-material/Google';
import type { ReactNode } from 'react';
import { useState, type FormEvent } from 'react';
import { Navigate, Link as RouterLink, useLocation } from 'react-router-dom';
import { useAuth } from '../authContext';

const float = keyframes`
  from { transform: translateY(-6px); }
  to   { transform: translateY(6px); }
`;

/** The themed centered shell: a floating hero vignette (injected per game),
 * the wordmark, the tagline, then the screen's action as children. */
export function LandingLayout({
  hero,
  name,
  tagline,
  children,
}: {
  /** The game's landing hero (e.g. a decorative board). Optional. */
  hero?: ReactNode;
  name: string;
  tagline: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: 3,
        overflow: 'hidden',
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ width: '100%', maxWidth: 460 }}>
        {hero && (
          <Box
            data-testid="landing-hero"
            aria-hidden
            sx={{
              animation: `${float} 6s ease-in-out infinite alternate`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {hero}
          </Box>
        )}
        <Stack spacing={1} alignItems="center">
          <Typography variant="h2" component="h1" fontWeight={700} letterSpacing="0.2em">
            {name}
          </Typography>
          <Typography color="text.secondary" align="center">
            {tagline}
          </Typography>
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}

/** The landing screen. Full mode boots with auth still resolving — show the
 * branded loading state, then either sign-in or (if already signed in) redirect
 * to the lobby. Hot-seat mode keeps the Play / Your games buttons. */
export function Landing({ hero, name, tagline }: { hero?: ReactNode; name: string; tagline: string }) {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (auth.mode === 'full' && auth.loading) {
    return (
      <LandingLayout {...(hero ? { hero } : {})} name={name} tagline={tagline}>
        <CircularProgress aria-label="loading" data-testid="landing-loading" />
      </LandingLayout>
    );
  }

  if (auth.mode === 'full' && auth.user) {
    return <Navigate to={from ?? '/lobby'} replace />;
  }

  return (
    <LandingLayout {...(hero ? { hero } : {})} name={name} tagline={tagline}>
      {auth.mode === 'full' ? (
        <Stack spacing={2} alignItems="center">
          <Button
            onClick={() => void auth.signInWithGoogle()}
            variant="contained"
            size="large"
            startIcon={<GoogleIcon />}
          >
            Sign in with Google
          </Button>
          {auth.emulators && <TestSignIn />}
        </Stack>
      ) : (
        <Stack direction="row" spacing={2}>
          <Button component={RouterLink} to="/game/local" variant="contained" size="large">
            Play hot-seat
          </Button>
          <Button component={RouterLink} to="/lobby" variant="outlined" size="large">
            Your games
          </Button>
        </Stack>
      )}
    </LandingLayout>
  );
}

/** Emulator-only: lets dev sessions and e2e sign in without an OAuth popup. */
function TestSignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email) void auth.signInWithTestAccount(email);
  };
  return (
    <Stack component="form" onSubmit={submit} direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        label="Test account email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        inputProps={{ 'data-testid': 'test-email' }}
      />
      <Button type="submit" variant="outlined" data-testid="test-sign-in">
        Test sign-in
      </Button>
    </Stack>
  );
}
