import { Button, Stack, TextField } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { useState, type FormEvent } from 'react';
import { Navigate, Link as RouterLink, useLocation } from 'react-router-dom';
import { useAuth } from '../sync/authContext';
import { LandingLayout } from './LandingLayout';

/** Landing (T4.1/T4.2): themed hero layout; hot-seat builds keep the Play
 * flow, full builds sign in with Google (emulator test form in dev/e2e). */
export function Landing() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

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
        <Button component={RouterLink} to="/lobby" variant="contained" size="large">
          Play
        </Button>
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
