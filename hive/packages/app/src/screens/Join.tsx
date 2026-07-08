// Hive join screen (T4.2/T4.7, DESIGN §6.1): the invite card + join-by-code
// live in @parlor/web/lobby-ui — this file supplies hive's expansion chips as
// the card's `details` slot so the invitee sees the rules before accepting,
// and maps the host's color to a seat index for the shared card. Firebase-free.
import { Chip } from '@mui/material';
import type { Color, GameOptions } from '@hive/engine';
import { JoinCard as ParlorJoinCard } from '@parlor/web/lobby-ui';
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
  if (state.kind !== 'ready') return <ParlorJoinCard state={state} onAccept={onAccept} />;
  return (
    <ParlorJoinCard
      state={{
        kind: 'ready',
        hostName: state.hostName,
        hostSeat: state.hostColor === 'w' ? 'p0' : 'p1',
        details: (
          <>
            {OPTION_LABELS.filter(([key]) => state.options[key]).map(([key, label]) => (
              <Chip key={key} label={label} size="small" />
            ))}
          </>
        ),
      }}
      onAccept={onAccept}
    />
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
