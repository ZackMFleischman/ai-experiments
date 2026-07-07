// ported from hive/packages/app/src/screens/Landing.tsx (adapted)
// Landing (T4.2): themed hero layout; hot-seat builds keep the Play flow,
// full builds sign in with Google (emulator test form in dev/e2e — production
// stays Google-only, IMPLEMENTATION §8.8).
import { Button, CircularProgress, Stack, TextField } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { useAuth } from '@parlor/web';
import { useState, type FormEvent } from 'react';
import { Navigate, Link as RouterLink, useLocation } from 'react-router-dom';
import { LandingLayout } from './LandingLayout';

export function Landing() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  // Full mode boots with auth still resolving. Show the branded LEX loading
  // screen while we determine whether the player is signed in — otherwise the
  // sign-in buttons flash for a beat before we redirect an already-signed-in
  // player to their games.
  if (auth.mode === 'full' && auth.loading) {
    return (
      <LandingLayout>
        <CircularProgress aria-label="loading" data-testid="landing-loading" />
      </LandingLayout>
    );
  }

  if (auth.mode === 'full' && auth.user) {
    return <Navigate to={from ?? '/lobby'} replace />;
  }

  return (
    <LandingLayout>
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
