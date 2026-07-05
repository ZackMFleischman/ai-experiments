// ported from hive/packages/app/src/screens/JoinByCode.tsx (adapted)
// Join-with-a-code entry (lobby): the invite works as a link OR a typed code —
// this is the typed half. Routes to /join/{code}; validation happens there.
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
