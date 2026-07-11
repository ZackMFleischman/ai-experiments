// Join: the invite card + join-by-code live in @parlor/web/lobby-ui — this
// file supplies checkers's option chips (SIDE, MOVE CLOCK) as the card's
// `details` slot so the invitee sees them before accepting. Firebase-free.
import { Chip } from '@mui/material';
import { JoinCard as ParlorJoinCard } from '@parlor/web/lobby-ui';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { sideLabel, timeControlLabel, type CheckersGameOptions } from '../gameOptions';
import { LandingLayout } from './Landing';

export type JoinState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | {
      kind: 'ready';
      hostName: string;
      hostSeat: 'attackers' | 'defenders';
      options: CheckersGameOptions;
    };

export function JoinCard({ state, onAccept }: { state: JoinState; onAccept: () => void }) {
  if (state.kind !== 'ready') return <ParlorJoinCard state={state} onAccept={onAccept} />;
  const mySide = state.hostSeat === 'attackers' ? 'defenders' : 'attackers';
  return (
    <ParlorJoinCard
      state={{
        kind: 'ready',
        hostName: state.hostName,
        // The shared card keys "who moves first" off p0/p1 seat indices.
        hostSeat: state.hostSeat === 'attackers' ? 'p0' : 'p1',
        details: (
          <>
            <Chip label={`You play ${sideLabel(mySide)}`} size="small" />
            <Chip label={timeControlLabel(state.options.timeControl)} size="small" />
          </>
        ),
      }}
      onAccept={onAccept}
    />
  );
}

// Full mode only: invite lookup + seat claim (kept out of the static bundle).
const JoinFlow =
  import.meta.env.VITE_CHECKERS_MODE === 'full' ? lazy(() => import('../sync/JoinFlow')) : null;

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
