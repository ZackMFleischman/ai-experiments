// ported from hive/packages/app/src/screens/Join.tsx + JoinByCode.tsx (adapted)
// The shared join surface: the invite summary card the invitee sees before
// accepting (loading / invalid / ready states — the game-specific option chips
// come in as `details`), and the join-with-a-code dialog (the typed half of an
// invite, which also works as a link). Firebase-free.
import {
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export type JoinState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; hostName: string; hostSeat: 'p0' | 'p1'; details?: ReactNode };

/** The invite summary card. `details` is the game-specific chip row (board,
 * dictionary, time control — whatever the game shows before you accept). */
export function JoinCard({ state, onAccept }: { state: JoinState; onAccept: () => void }) {
  return (
    <Card sx={{ width: '100%' }} data-testid="join-card">
      <CardContent>
        {state.kind === 'loading' && (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={28} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Checking your invite…
            </Typography>
          </Stack>
        )}
        {state.kind === 'invalid' && (
          <Typography align="center" sx={{ py: 2 }}>
            This invite is no longer valid — it may have expired or already been accepted.
          </Typography>
        )}
        {state.kind === 'ready' && (
          <Stack spacing={2} alignItems="center">
            <Typography variant="h6" component="h2">
              {state.hostName} invited you to a game
            </Typography>
            <Typography color="text.secondary">
              You&apos;ll go {state.hostSeat === 'p0' ? 'second' : 'first'}
            </Typography>
            {state.details && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
                {state.details}
              </Stack>
            )}
            <Button variant="contained" size="large" onClick={onAccept} data-testid="join-accept">
              Accept invite
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

/** A single option chip, re-exported so games render `details` consistently. */
export function OptionChip({ label }: { label: ReactNode }) {
  return <Chip label={label} size="small" />;
}

const CODE_RE = /^[A-Z2-9]{8}$/; // createGame's no-lookalike alphabet

export function JoinByCodeButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const cleaned = code.toUpperCase().replace(/\s/g, '');
  const valid = CODE_RE.test(cleaned);
  const go = () => {
    if (valid) void navigate(`/join/${cleaned}`);
  };
  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)} data-testid="join-by-code">
        Join with a code
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Join a game</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Invite code"
            placeholder="e.g. HK4M2XQ9"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            inputProps={{
              'data-testid': 'join-code-input',
              autoCapitalize: 'characters',
              autoCorrect: 'off',
              spellCheck: false,
              style: { textTransform: 'uppercase', letterSpacing: '0.15em' },
            }}
            helperText="8 letters/digits from your friend's invite"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!valid} onClick={go} data-testid="join-code-go">
            Join
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
