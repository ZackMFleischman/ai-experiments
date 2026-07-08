// Screen entries (T4.2+): landing and join states for the visual harness.
// Lobby and new-game entries arrive with T4.7.
import { Box, Typography } from '@mui/material';
import { initialState, serializeState } from '@hive/engine';
import type { GalleryEntry } from '../galleryRegistry';
import { ForcedBearMode } from '../../board/pieceArt';
import { PieceGuideDialog } from '../../game/PieceGuide';
import { Landing } from '../../screens/Landing';
import { JoinCard } from '../../screens/Join';
import { LandingLayout } from '../../screens/LandingLayout';
import { InstallCoachMark } from '@parlor/web';
import { LobbyView, type LobbyGameSummary } from '../../screens/lobbyView';
import { InviteLinkView, NewGameForm } from '../../screens/newGameView';
import { ChallengeReceived, WaitingForOpponent } from '../../screens/waitingView';
import { AuthContext, HOTSEAT_AUTH, type AuthValue } from '@parlor/web';
import { ALL_ON, EARLY_GAME, MID_GAME, replayUhp } from '../fixtures';

const noop = async () => {};

const SIGNED_OUT_FULL: AuthValue = {
  ...HOTSEAT_AUTH,
  mode: 'full',
  signInWithGoogle: noop,
  signInWithTestAccount: noop,
  signOut: noop,
};

const NOW = 1_751_500_000_000; // fixed for deterministic captures
const mkState = (moves: string[]) => serializeState(replayUhp(moves));

const LOBBY_GAMES: LobbyGameSummary[] = [
  { id: 'g1', myColor: 'w', opponentName: 'Sam', status: 'active', toMove: 'w',
    updatedAtMs: NOW - 2 * 3_600_000, state: mkState(MID_GAME) },
  { id: 'g2', myColor: 'b', opponentName: 'Priya', status: 'active', toMove: 'w',
    updatedAtMs: NOW - 26 * 3_600_000, state: mkState(EARLY_GAME) },
  { id: 'g3', myColor: 'w', opponentName: null, status: 'open', toMove: 'w',
    updatedAtMs: NOW - 300_000, state: serializeState(initialState(ALL_ON)) },
  { id: 'g4', myColor: 'w', opponentName: 'Sam', status: 'finished', result: 'white',
    endedBy: 'surround', toMove: 'b', updatedAtMs: NOW - 3 * 86_400_000, state: mkState(MID_GAME) },
  { id: 'g5', myColor: 'b', opponentName: 'Priya', status: 'finished', result: 'white',
    endedBy: 'resign', toMove: 'w', updatedAtMs: NOW - 5 * 86_400_000, state: mkState(EARLY_GAME) },
];

// Direct challenges (DESIGN §5.2/§6.1): an incoming one (accept/decline group)
// and an outgoing one waiting under 'Challenge sent'.
const LOBBY_WITH_CHALLENGES: LobbyGameSummary[] = [
  { id: 'c1', myColor: 'b', opponentName: 'Ada', status: 'open', toMove: 'w',
    challenge: { direction: 'incoming', name: 'Ada' },
    updatedAtMs: NOW - 120_000, state: serializeState(initialState(ALL_ON)) },
  { id: 'c2', myColor: 'w', opponentName: 'Priya', status: 'open', toMove: 'w',
    challenge: { direction: 'outgoing', name: 'Priya' },
    updatedAtMs: NOW - 600_000, state: serializeState(initialState(ALL_ON)) },
  ...LOBBY_GAMES.slice(0, 2),
];

function LobbyFrame({ games }: { games: LobbyGameSummary[] }) {
  return (
    <Box sx={{ p: 3, minHeight: '100dvh' }}>
      <Typography variant="h5" component="h1">
        Your games
      </Typography>
      <LobbyView games={games} now={NOW} onOpen={() => {}} />
    </Box>
  );
}

export const screenEntries: GalleryEntry[] = [
  {
    id: 'lobby-coach-mark',
    render: () => (
      <Box sx={{ p: 3, maxWidth: 480 }}>
        <InstallCoachMark onDismiss={() => {}} />
      </Box>
    ),
  },
  { id: 'lobby-populated', render: () => <LobbyFrame games={LOBBY_GAMES} /> },
  { id: 'lobby-challenges', render: () => <LobbyFrame games={LOBBY_WITH_CHALLENGES} /> },
  { id: 'lobby-empty', render: () => <LobbyFrame games={[]} /> },
  {
    id: 'new-game-form',
    render: () => (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          New game
        </Typography>
        <NewGameForm onCreate={() => {}} />
      </Box>
    ),
  },
  {
    id: 'new-game-friends',
    render: () => (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          New game
        </Typography>
        <NewGameForm
          onCreate={() => {}}
          friends={[
            { uid: 'u1', name: 'Sam' },
            { uid: 'u2', name: 'Priya' },
          ]}
        />
      </Box>
    ),
  },
  {
    id: 'new-game-invite-link',
    render: () => (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          New game
        </Typography>
        <InviteLinkView code="HK4M2XQ9" gameId="g1" onOpenGame={() => {}} />
      </Box>
    ),
  },
  {
    id: 'game-waiting-for-opponent',
    render: () => <WaitingForOpponent code="HK4M2XQ9" onCancel={() => {}} />,
  },
  {
    id: 'game-challenge-sent',
    render: () => <WaitingForOpponent challengeName="Sam" onCancel={() => {}} />,
  },
  {
    id: 'game-challenge-received',
    render: () => <ChallengeReceived name="Ada" onRespond={() => {}} />,
  },
  {
    id: 'landing-signin',
    render: () => (
      <AuthContext.Provider value={SIGNED_OUT_FULL}>
        <Landing />
      </AuthContext.Provider>
    ),
  },
  { id: 'landing-hotseat', render: () => <Landing /> },
  {
    id: 'join-ready',
    render: () => (
      <LandingLayout>
        <JoinCard
          state={{
            kind: 'ready',
            hostName: 'Sam',
            hostColor: 'w',
            options: { mosquito: true, ladybug: true, pillbug: true, tournamentOpening: true },
          }}
          onAccept={() => {}}
        />
      </LandingLayout>
    ),
  },
  {
    id: 'join-invalid',
    render: () => (
      <LandingLayout>
        <JoinCard state={{ kind: 'invalid' }} onAccept={() => {}} />
      </LandingLayout>
    ),
  },
  { id: 'piece-guide', render: () => <PieceGuideDialog open onClose={() => {}} /> },
  {
    id: 'piece-guide-bears',
    render: () => (
      <ForcedBearMode>
        <PieceGuideDialog open onClose={() => {}} />
      </ForcedBearMode>
    ),
  },
];
