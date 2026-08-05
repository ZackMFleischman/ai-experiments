// A render crash shows a reload card instead of a blank page. The only
// per-app difference was ever the reassurance line ("your puzzle is saved…"),
// so that's the one prop (PORTFOLIO-HARDENING M5).
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Component, type ReactNode } from 'react';

export interface BrandErrorBoundaryProps {
  children: ReactNode;
  /** What the player is told survives the crash (game/stats/streak copy). */
  reassurance: string;
}

interface State {
  failed: boolean;
}

export class BrandErrorBoundary extends Component<BrandErrorBoundaryProps, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {this.props.reassurance}
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Box>
      </Box>
    );
  }
}
