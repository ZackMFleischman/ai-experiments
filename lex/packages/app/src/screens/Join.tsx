// Lex join screen (T4.7, DESIGN §7.1, FR-10): the invite card + join-by-code
// live in @parlor/web/lobby-ui — this file supplies lex's option chips (BOARD,
// DICTIONARY, TIME CONTROL) as the card's `details` slot so the invitee sees
// them before accepting. Firebase-free.
import { Chip } from '@mui/material';
import { DICTIONARIES } from '@lex/dict';
import { JoinCard as ParlorJoinCard } from '@parlor/web/lobby-ui';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import {
  boardName,
  INVALID_WORDS_NAME,
  invalidWordsLabel,
  timeControlLabel,
  type LexGameOptions,
} from '../gameOptions';
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
  if (state.kind !== 'ready') return <ParlorJoinCard state={state} onAccept={onAccept} />;
  return (
    <ParlorJoinCard
      state={{
        kind: 'ready',
        hostName: state.hostName,
        hostSeat: state.hostSeat,
        details: (
          <>
            <Chip label={`${boardName(state.options.rulesetId)} board`} size="small" />
            <Chip label={dictionaryLabel(state.options.dictionaryId)} size="small" />
            <Chip label={timeControlLabel(state.options.timeControl)} size="small" />
            {/* The invitee sees every chosen option before accepting (FR-10).
                This one is highlighted rather than stated flatly like the rest,
                because it is the only setting here that can cost them a turn —
                and only when it is set away from the default. */}
            {state.options.invalidWords === 'costs-turn' && (
              <Chip
                label={`${INVALID_WORDS_NAME.toLowerCase()} ${invalidWordsLabel('costs-turn').toLowerCase()}`}
                size="small"
                color="warning"
                data-testid="join-invalid-words"
              />
            )}
          </>
        ),
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
