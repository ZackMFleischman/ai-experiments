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
import { InstallCoachMark } from '../../screens/InstallCoachMark';
import { LobbyView, type LobbyGameSummary } from '../../screens/lobbyView';
import { InviteLinkView, NewGameForm } from '../../screens/newGameView';
import { AuthContext, HOTSEAT_AUTH, type AuthValue } from '../../sync/authContext';
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
    id: 'new-game-invite-link',
    render: () => (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          New game
        </Typography>
        <InviteLinkView url="https://hive.zackmfleischman.com/join/HK4M2XQ9" gameId="g1" onOpenGame={() => {}} />
      </Box>
    ),
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
