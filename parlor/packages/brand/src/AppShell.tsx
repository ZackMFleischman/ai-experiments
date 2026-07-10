// The shared app chrome: a quiet top bar (title, optional back, action
// slots) over a width-capped content column with safe-area padding baked in
// (the Capacitor/notch defense every app needs). Screens render inside;
// games keep their boards full-bleed by opting out of the container.
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface AppShellProps {
  title: string;
  /** Renders a back affordance when provided. */
  onBack?: (() => void) | undefined;
  /** Right-side toolbar actions (settings gear, help, …). */
  actions?: ReactNode;
  /** Full-bleed content (game boards) skips the width-capped container. */
  fullBleed?: boolean;
  children: ReactNode;
}

export function AppShell({ title, onBack, actions, fullBleed = false, children }: AppShellProps) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        pt: 'env(safe-area-inset-top)',
        pb: 'env(safe-area-inset-bottom)',
        pl: 'env(safe-area-inset-left)',
        pr: 'env(safe-area-inset-right)',
      }}
    >
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          {onBack && (
            <IconButton edge="start" aria-label="back" onClick={onBack}>
              {/* Text glyph keeps @mui/icons-material out of the peer surface. */}
              <Box component="span" aria-hidden sx={{ fontSize: 22, lineHeight: 1 }}>
                ‹
              </Box>
            </IconButton>
          )}
          <Typography variant="h3" component="h1" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          {actions}
        </Toolbar>
      </AppBar>
      {/* The content area is the page's one <main> landmark (a11y); the bar
          above stays chrome. */}
      {fullBleed ? (
        <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </Box>
      ) : (
        <Container component="main" maxWidth="sm" sx={{ flexGrow: 1, pb: 3 }}>
          {children}
        </Container>
      )}
    </Box>
  );
}
