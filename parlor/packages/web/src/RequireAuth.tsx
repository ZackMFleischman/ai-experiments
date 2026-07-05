// ported from hive/packages/app/src/sync/RequireAuth.tsx (adapted)
// Route guard. Firebase-free: reads AuthContext only, so it is safe in a
// hot-seat bundle (where mode is 'hotseat' and it renders children as-is).
import { Box, CircularProgress } from '@mui/material';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { mode, user, loading } = useAuth();
  const location = useLocation();
  if (mode !== 'full') return <>{children}</>;
  if (loading) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
