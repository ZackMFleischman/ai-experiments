// Screen entries (T4.2+): landing and join states for the visual harness.
// Lobby and new-game entries arrive with T4.7.
import type { GalleryEntry } from '../galleryRegistry';
import { Landing } from '../../screens/Landing';
import { JoinCard } from '../../screens/Join';
import { LandingLayout } from '../../screens/LandingLayout';
import { AuthContext, HOTSEAT_AUTH, type AuthValue } from '../../sync/authContext';

const noop = async () => {};

const SIGNED_OUT_FULL: AuthValue = {
  ...HOTSEAT_AUTH,
  mode: 'full',
  signInWithGoogle: noop,
  signInWithTestAccount: noop,
  signOut: noop,
};

export const screenEntries: GalleryEntry[] = [
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
];
