// Join screen (T4.2, DESIGN §6.1): same themed layout as the landing with a
// game-summary card and one accept button. Invite lookup + seat claim wire up
// with the invite flow (T4.7); until then the live route shows the pending card.
import {
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import type { Color, GameOptions } from '@hive/engine';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { LandingLayout } from './LandingLayout';

export type JoinState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; hostName: string; hostColor: Color; options: GameOptions };

const OPTION_LABELS: ReadonlyArray<[keyof GameOptions, string]> = [
  ['mosquito', 'Mosquito'],
  ['ladybug', 'Ladybug'],
  ['pillbug', 'Pillbug'],
  ['tournamentOpening', 'Tournament opening'],
];

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
              You&apos;ll play {state.hostColor === 'w' ? 'black' : 'white'}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
              {OPTION_LABELS.filter(([key]) => state.options[key]).map(([key, label]) => (
                <Chip key={key} label={label} size="small" />
              ))}
            </Stack>
            <Button variant="contained" size="large" onClick={onAccept} data-testid="join-accept">
              Accept invite
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

// Full mode only: invite lookup + seat claim (kept out of the static bundle).
const JoinFlow =
  import.meta.env.VITE_HIVE_MODE === 'full' ? lazy(() => import('../sync/JoinFlow')) : null;

export function Join() {
  const { code } = useParams<{ code: string }>();
  return (
    <LandingLayout>
      {JoinFlow && code ? (
        <Suspense fallback={<JoinCard state={{ kind: 'loading' }} onAccept={() => {}} />}>
          <JoinFlow code={code} />
        </Suspense>
      ) : (
        <JoinCard state={{ kind: 'invalid' }} onAccept={() => {}} />
      )}
    </LandingLayout>
  );
}
