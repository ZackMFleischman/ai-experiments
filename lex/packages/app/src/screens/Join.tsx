// Lex join screen (T4.7 + T7.15, DESIGN §7.1, FR-10): the invite card +
// join-by-code live in @parlor/web/lobby-ui — this file supplies lex's option
// chips (BOARD, DICTIONARY, TIME CONTROL) as the card's `details` slot so the
// invitee sees them before accepting, and the 3+ variant, where the code opens
// a ROOM rather than a seat: who is already in, how many places are left, and
// the plain fact that arriving first is what gets you one. Firebase-free.
import { Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { DICTIONARIES } from '@lex/dict';
import { JoinCard as ParlorJoinCard } from '@parlor/web/lobby-ui';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { boardName, timeControlLabel, type LexGameOptions } from '../gameOptions';
import { LandingLayout } from './LandingLayout';

export type JoinState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  // The code was good — the room filled up or the host started without you.
  | { kind: 'closed' }
  | { kind: 'ready'; hostName: string; hostSeat: 'p0' | 'p1'; options: LexGameOptions }
  // A 3+ room: seats do not exist yet, so there is no "you'll go first" to
  // promise — only a guest list and the places left on it.
  | {
      kind: 'room';
      hostName: string;
      /** Roster display names in join order (the invite preview carries no uids). */
      names: readonly string[];
      filled: number;
      maxPlayers: number;
      options: LexGameOptions;
    };

function dictionaryLabel(id: string): string {
  const d = DICTIONARIES.find((entry) => entry.id === id);
  return d ? `${d.name} · ${Math.round(d.wordCount / 1000)}k words` : id;
}

/** The FR-10 chip row — identical whichever card carries it. */
function OptionChips({ options }: { options: LexGameOptions }) {
  return (
    <>
      <Chip label={`${boardName(options.rulesetId)} board`} size="small" />
      <Chip label={dictionaryLabel(options.dictionaryId)} size="small" />
      <Chip label={timeControlLabel(options.timeControl)} size="small" />
    </>
  );
}

export function JoinCard({ state, onAccept }: { state: JoinState; onAccept: () => void }) {
  // The room preview is lex's own card rather than lobby-ui's
  // `InvitationReceived`: that one is a full-height screen for a player already
  // inside the app, and this one sits in the landing shell under the hero.
  if (state.kind === 'room') {
    const open = Math.max(0, state.maxPlayers - state.filled);
    const others = state.names.filter((name) => name !== state.hostName);
    return (
      <Card sx={{ width: '100%' }} data-testid="join-card">
        <CardContent>
          <Stack spacing={2} alignItems="center">
            <Typography variant="h6" component="h2">
              {state.hostName} invited you to a game
            </Typography>
            <Typography color="text.secondary" align="center" data-testid="join-roster">
              {others.length > 0
                ? `${state.hostName} and ${others.join(', ')} are in.`
                : `${state.hostName} is in — you'd be the first to join.`}
            </Typography>
            <Typography color="text.secondary" align="center" data-testid="join-seats">
              {state.filled} of {state.maxPlayers} seats filled — {open}{' '}
              {open === 1 ? 'seat' : 'seats'} left.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
              <OptionChips options={state.options} />
            </Stack>
            <Typography variant="body2" color="text.secondary" align="center">
              Your rack is dealt when the host starts.
            </Typography>
            <Button variant="contained" size="large" onClick={onAccept} data-testid="join-accept">
              Take a seat
            </Button>
          </Stack>
        </CardContent>
      </Card>
    );
  }
  if (state.kind !== 'ready') return <ParlorJoinCard state={state} onAccept={onAccept} />;
  return (
    <ParlorJoinCard
      state={{
        kind: 'ready',
        hostName: state.hostName,
        hostSeat: state.hostSeat,
        details: <OptionChips options={state.options} />,
      }}
      onAccept={onAccept}
    />
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
