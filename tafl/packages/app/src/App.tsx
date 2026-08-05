// Providers + routes. First duo title on @parlor/brand: the family theme +
// color-mode plumbing replace the hand-rolled theme.ts hive and lex carry.
// The firebase provider stack loads only in full (multiplayer) mode — the
// default build stays a firebase-free static hot-seat PWA (check-bundle).
import { BrandAppProviders } from '@parlor/brand';
import { RequireAuth } from '@parlor/web';
import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { Game } from './screens/Game';
import { Join } from './screens/Join';
import { Landing } from './screens/Landing';
import { Lobby } from './screens/Lobby';
import { NewGame } from './screens/NewGame';

// Tafl teal — the app's single accent (family theme injects the rest).
export const ACCENT = { main: '#0b7285' };

const MODE_KEY = 'tafl:mode';

// DEV-only: the validation gallery — lazy behind import.meta.env.DEV so it
// never reaches a production bundle.
const GalleryRoute = import.meta.env.DEV ? lazy(() => import('./dev/GalleryRoute')) : null;

// Full (multiplayer) mode only: the firebase-backed provider stack. The
// static hot-seat build (no VITE_TAFL_MODE) drops this branch at build time.
const SyncProviders =
  import.meta.env.VITE_TAFL_MODE === 'full' ? lazy(() => import('./sync/AppSyncProviders')) : null;

/** The hot-seat game stays unguarded (fully local); real games need auth. */
function GameGate() {
  const { id } = useParams<{ id: string }>();
  if (id === 'local') return <Game />;
  return (
    <RequireAuth>
      <Game />
    </RequireAuth>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/lobby"
        element={
          <RequireAuth>
            <Lobby />
          </RequireAuth>
        }
      />
      <Route
        path="/new"
        element={
          <RequireAuth>
            <NewGame />
          </RequireAuth>
        }
      />
      <Route
        path="/join/:code"
        element={
          <RequireAuth>
            <Join />
          </RequireAuth>
        }
      />
      <Route path="/game/:id" element={<GameGate />} />
      {GalleryRoute && (
        <Route
          path="/dev/gallery"
          element={
            <Suspense fallback={null}>
              <GalleryRoute />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const themed = (
    <BrandAppProviders accent={ACCENT} modeKey={MODE_KEY}>
      {children}
    </BrandAppProviders>
  );
  if (!SyncProviders) return themed;
  return (
    <Suspense fallback={null}>
      <SyncProviders>{themed}</SyncProviders>
    </Suspense>
  );
}
