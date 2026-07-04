// Waiting-for-opponent presentation: shown by the multiplayer game route while
// the game doc is still status:'open'. The invite stays retrievable here — as
// a link AND a bare code the friend can type in. Firebase-free.
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

/** Link + code share block (also embedded in the post-create screen). */
export function InviteShare({ code }: { code: string }) {
  const url = `${window.location.origin}/join/${code}`;
  const [copied, setCopied] = useState<'url' | 'code' | null>(null);
  const copy = (what: 'url' | 'code', text: string) => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(what));
  };
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          value={url}
          inputProps={{ readOnly: true, 'data-testid': 'invite-url' }}
        />
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={() => copy('url', url)}
          data-testid="copy-invite"
        >
          {copied === 'url' ? 'Copied' : 'Copy'}
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
        <Typography variant="body2" color="text.secondary">
          or they can enter the code
        </Typography>
        <Typography
          variant="h6"
          data-testid="invite-code"
          sx={{ fontFamily: 'monospace', letterSpacing: '0.2em', fontWeight: 700 }}
        >
          {code}
        </Typography>
        <IconButton
          size="small"
          aria-label="copy code"
          onClick={() => copy('code', code)}
          data-testid="copy-code"
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Stack>
  );
}

export function WaitingForOpponent({
  code,
  challengeName,
  onCancel,
}: {
  code?: string | undefined;
  /** Direct challenge (no invite): who it was sent to. */
  challengeName?: string | undefined;
  /** Cancel the open game + invite/challenge (multiplayer container wires the callable). */
  onCancel?: () => void;
}) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 440 }} data-testid="waiting-for-opponent">
        <CardContent>
          <Stack spacing={2.5} alignItems="center" sx={{ py: 1 }}>
            <CircularProgress size={28} />
            <Typography variant="h6" component="h2">
              {challengeName ? `Waiting for ${challengeName}…` : 'Waiting for your opponent…'}
            </Typography>
            {challengeName ? (
              <Typography color="text.secondary" align="center">
                Your challenge is out to {challengeName} — the game starts the moment they
                accept.
              </Typography>
            ) : code ? (
              <>
                <Typography color="text.secondary" align="center">
                  Send them this invite — the game starts the moment they accept.
                </Typography>
                <Box sx={{ width: '100%' }}>
                  <InviteShare code={code} />
                </Box>
              </>
            ) : (
              <Typography color="text.secondary" align="center">
                Your invite is out — this screen starts the game the moment they accept.
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button
                component={RouterLink}
                to="/lobby"
                startIcon={<ArrowBackIcon />}
                data-testid="waiting-back-to-lobby"
              >
                Back to lobby
              </Button>
              {onCancel && (
                <Button color="error" onClick={onCancel} data-testid="cancel-invite">
                  {challengeName ? 'Withdraw challenge' : 'Cancel invite'}
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

/** The challenged player's side of an open challenge game: accept to sit
 * down, decline to delete it. Firebase-free — the multiplayer container
 * wires respondChallenge. */
export function ChallengeReceived({
  name,
  onRespond,
  busy = false,
}: {
  name: string;
  onRespond: (accept: boolean) => void;
  busy?: boolean;
}) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 440 }} data-testid="challenge-received">
        <CardContent>
          <Stack spacing={2.5} alignItems="center" sx={{ py: 1 }}>
            <Typography variant="h6" component="h2">
              {name} challenges you
            </Typography>
            <Typography color="text.secondary" align="center">
              Accept to take the open seat — the game starts right away.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                color="error"
                disabled={busy}
                onClick={() => onRespond(false)}
                data-testid="challenge-decline"
              >
                Decline
              </Button>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => onRespond(true)}
                data-testid="challenge-accept"
              >
                Accept
              </Button>
            </Stack>
            <Button
              component={RouterLink}
              to="/lobby"
              startIcon={<ArrowBackIcon />}
              data-testid="waiting-back-to-lobby"
            >
              Back to lobby
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
