// ported from hive/packages/app/src/screens/Join.tsx (adapted)
// Join screen (T4.7, DESIGN §7.1, FR-10): same themed layout as the landing
// with a game-summary card — the invitee sees the BOARD, DICTIONARY, TIME
// CONTROL, and their seat before accepting — and one accept button.
import {
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { DICTIONARIES } from '@lex/dict';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { boardName, timeControlLabel, type LexGameOptions } from '../gameOptions';
import { LandingLayout } from './LandingLayout';

export type JoinState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; hostName: string; hostSeat: 'p0' | 'p1'; options: LexGameOptions };

function dictionaryLabel(id: string): string {
  const d = DICTIONARIES.find((entry) => entry.id === id);
  return d ? `${d.name} · ${Math.round(d.wordCount / 1000)}k words` : id;
}

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
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
              <Chip label={`${boardName(state.options.rulesetId)} board`} size="small" />
              <Chip label={dictionaryLabel(state.options.dictionaryId)} size="small" />
              <Chip label={timeControlLabel(state.options.timeControl)} size="small" />
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
  import.meta.env.VITE_LEX_MODE === 'full' ? lazy(() => import('../sync/JoinFlow')) : null;

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
