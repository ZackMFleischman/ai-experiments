// The one header every play surface wears, directly under the AppShell bar
// (DESIGN-PRINCIPLES.md §2). Its shape follows the player count: two seats
// render as plaques with the active one carrying the accent — turn state
// legible without reading a word — while a solo surface gets a plain
// status/meta row. The status text is the single line of truth; tests and
// e2e key off data-testid="status-line", so games change the words, never
// the marker.
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';

export interface HudSeat {
  /** Display name ("Dark", or the online opponent's name). */
  label: string;
  /** A small side mark (piece dot, ⚔ …). Optional. */
  glyph?: ReactNode;
  /** The seat whose turn it is; exactly one while a game runs. */
  active?: boolean;
}

export interface GameHudProps {
  /** Two-player games pass both seats; solo surfaces omit this. */
  seats?: readonly [HudSeat, HudSeat];
  /** The single status line ("Dark to move", "Your move", score…). */
  status: ReactNode;
  /** Quiet right-side / center metadata ("move 12", elapsed, lives). */
  meta?: ReactNode;
}

function SeatPlaque({ seat }: { seat: HudSeat }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      {...(seat.active ? { 'aria-current': true } : {})}
      sx={(theme) => ({
        px: 1.25,
        py: 0.5,
        minWidth: 0,
        borderRadius: 999,
        border: 1,
        borderColor: seat.active ? 'primary.main' : 'transparent',
        bgcolor: seat.active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
        color: seat.active ? 'text.primary' : 'text.secondary',
      })}
    >
      {seat.glyph && (
        <Box component="span" aria-hidden sx={{ display: 'inline-flex', lineHeight: 1 }}>
          {seat.glyph}
        </Box>
      )}
      <Typography
        component="span"
        variant="body2"
        noWrap
        sx={{ fontWeight: seat.active ? 700 : 500, minWidth: 0 }}
      >
        {seat.label}
      </Typography>
    </Stack>
  );
}

export function GameHud({ seats, status, meta }: GameHudProps) {
  if (seats) {
    const [first, second] = seats;
    return (
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        data-hud
      >
        <SeatPlaque seat={first} />
        <Stack alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body2"
            component="p"
            noWrap
            fontWeight={600}
            data-testid="status-line"
            sx={{ maxWidth: '100%' }}
          >
            {status}
          </Typography>
          {/* component="div": meta is any ReactNode (chips included) —
              block elements can't nest in a <p>. */}
          {meta && (
            <Typography variant="caption" component="div" color="text.secondary" noWrap>
              {meta}
            </Typography>
          )}
        </Stack>
        <SeatPlaque seat={second} />
      </Stack>
    );
  }
  return (
    <Stack
      direction="row"
      alignItems="baseline"
      justifyContent="space-between"
      spacing={1}
      data-hud
    >
      <Typography variant="subtitle1" component="p" fontWeight={600} data-testid="status-line">
        {status}
      </Typography>
      {meta && (
        <Typography variant="body2" component="div" color="text.secondary">
          {meta}
        </Typography>
      )}
    </Stack>
  );
}
