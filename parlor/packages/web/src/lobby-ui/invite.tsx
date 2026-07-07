// ported from hive/packages/app/src/screens/waitingView.tsx (adapted)
// The shared invite/waiting presentation: the link+code share block, the
// waiting-for-opponent screen (open invite or outgoing challenge), the
// challenged-player's accept/decline screen, and the post-create invite view.
// Firebase-free — the game's multiplayer container wires the callables. Copy
// that differs per game (what "accept" means) is injected via props.
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
import type { ReactNode } from 'react';
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
                Your challenge is out to {challengeName} — the game starts the moment they accept.
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

/** The challenged player's side of an open challenge game: accept to sit down,
 * decline to delete it. Firebase-free — the multiplayer container wires
 * respondChallenge. `blurb` is the game-specific accept copy. */
export function ChallengeReceived({
  name,
  onRespond,
  busy = false,
  blurb = 'Accept to take the open seat — the game starts right away.',
}: {
  name: string;
  onRespond: (accept: boolean) => void;
  busy?: boolean;
  blurb?: ReactNode;
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
              {blurb}
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

/** Post-create invite view: shown right after createGame returns a code. */
export function InviteLinkView({
  code,
  gameId,
  onOpenGame,
}: {
  code: string;
  gameId: string;
  onOpenGame: (gameId: string) => void;
}) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }} data-testid="invite-link-view">
      <Typography>
        Send your friend this invite — the game starts when they accept. The link and code stay
        available on the game screen while you wait.
      </Typography>
      <InviteShare code={code} />
      <Button variant="contained" onClick={() => onOpenGame(gameId)} data-testid="open-created-game">
        Open the game
      </Button>
    </Stack>
  );
}
