// The shared game surface: one board screen over a LogSession, used by both
// hot-seat (acting side follows the turn) and online (perspective locked to
// my side). Renders under the brand AppShell — tafl is the first duo title
// on @parlor/brand. Phone-first: the 11×11 board runs edge to edge and the
// column fills the viewport (HUD above, seats below, board centered in the
// leftover space). The UI folds engine state only; every mutation is a log
// entry through the session.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { AppShell } from '@parlor/brand';
import type { Side, TaflMove, TaflState } from '@tafl/engine';
import { useState, useSyncExternalStore } from 'react';
import { sideLabel } from '../gameOptions';
import { otherSide, type TaflEntry } from './entries';
import type { TaflSession } from './localSession';
import { Board, PieceGlyph } from '../board/Board';

export type GameMode = { kind: 'hotseat' } | { kind: 'online'; mySide: Side };

export interface GameScreenProps {
  session: TaflSession;
  mode: GameMode;
  /** [attackers, defenders] display names. */
  seatNames: readonly [string | null, string | null];
  onExit: () => void;
  /** Online: offer/converge on the next game. Hot-seat: omitted. */
  onRematch?: (() => void) | undefined;
}

function useSessionState(session: TaflSession): TaflState | null {
  return useSyncExternalStore(session.subscribe, () => session.state);
}

function outcomeText(state: TaflState, mode: GameMode): string {
  const result = state.result;
  if (!result) return '';
  if (result.winner === null) return 'A draw — the same position three times.';
  const winner = sideLabel(result.winner);
  const how =
    result.by === 'escape'
      ? 'the king reached a corner'
      : result.by === 'capture'
        ? 'the king was taken'
        : result.by === 'no-moves'
          ? 'no legal moves left'
          : result.by;
  if (mode.kind === 'online') {
    return result.winner === mode.mySide ? `You won — ${how}.` : `You lost — ${how}.`;
  }
  return `${winner} win — ${how}.`;
}

/** One end of the seats bar: piece glyph + name, lit while it's that side's
 * turn so the eye finds whose move it is without reading. */
function SeatPlaque({
  side,
  name,
  active,
  align,
}: {
  side: Side;
  name: string;
  active: boolean;
  align: 'left' | 'right';
}) {
  const theme = useTheme();
  return (
    <Stack
      direction={align === 'left' ? 'row' : 'row-reverse'}
      spacing={1}
      alignItems="center"
      sx={{
        flex: 1,
        minWidth: 0,
        px: 1.25,
        py: 0.75,
        borderRadius: 2,
        bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
        opacity: active ? 1 : 0.55,
        transition: 'background-color 150ms ease, opacity 150ms ease',
      }}
    >
      <Box sx={{ width: 18, height: 18, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <PieceGlyph piece={side === 'attackers' ? 'A' : 'D'} size="16px" />
      </Box>
      <Typography
        variant="body2"
        noWrap
        sx={{ fontWeight: active ? 700 : 500, textAlign: align }}
      >
        {name}
      </Typography>
    </Stack>
  );
}

export function GameScreen({ session, mode, seatNames, onExit, onRematch }: GameScreenProps) {
  const state = useSessionState(session);
  const [confirmResign, setConfirmResign] = useState(false);
  if (!state) return null;

  const actingSide: Side | undefined =
    mode.kind === 'hotseat'
      ? state.toMove
      : mode.mySide === state.toMove
        ? mode.mySide
        : undefined;

  const lastEntry = session.log[session.log.length - 1];
  const lastMove: TaflMove | undefined =
    lastEntry?.kind === 'move' ? { from: lastEntry.from, to: lastEntry.to } : undefined;

  const submitMove = (move: TaflMove): void => {
    const entry: TaflEntry = { kind: 'move', ...move };
    // Online transports may refuse (stale/turn) — resync adopts the truth.
    session.submit(entry, mode.kind === 'online' ? 'resync' : 'rollback');
  };

  const resign = (): void => {
    const by: Side = mode.kind === 'online' ? mode.mySide : state.toMove;
    session.submit({ kind: 'resign', by }, mode.kind === 'online' ? 'resync' : 'rollback');
    setConfirmResign(false);
  };

  const name = (side: Side): string =>
    (side === 'attackers' ? seatNames[0] : seatNames[1]) ?? sideLabel(side);

  const statusLine = state.result
    ? outcomeText(state, mode)
    : mode.kind === 'online'
      ? state.toMove === mode.mySide
        ? 'Your move'
        : `Waiting for ${name(state.toMove)}…`
      : `${name(state.toMove)} to move`;

  return (
    <AppShell title="Tafl" onBack={onExit} fullBleed>
      <Stack
        sx={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: { xs: '100%', sm: 640 },
          mx: 'auto',
          px: { xs: 1, sm: 2 },
          pb: { xs: 1.5, sm: 2 },
        }}
      >
        {/* HUD: whose move (with the mover's glyph) left, move counter right. */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ px: 0.5, pb: 1, minHeight: 36 }}
          data-hud
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            {!state.result && (
              <Box sx={{ width: 20, height: 20, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <PieceGlyph piece={state.toMove === 'attackers' ? 'A' : 'D'} size="17px" />
              </Box>
            )}
            <Typography
              variant="h3"
              component="p"
              noWrap
              sx={{ fontSize: '1.05rem' }}
              data-testid="status-line"
            >
              {statusLine}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
            move {state.moveCount + 1}
          </Typography>
        </Stack>

        {/* The board owns the leftover viewport: full width on phones, clamped
            so it always fits the height with the HUD and seats bar around it. */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
          <Box sx={{ width: 'min(100%, calc(100dvh - 230px))' }}>
            <Board
              state={state}
              onMove={submitMove}
              actingSide={state.result ? undefined : actingSide}
              lastMove={lastMove}
            />
          </Box>
        </Box>

        {/* Seats bar: both players, the side to move lit; resign stays quiet. */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ pt: 1.25 }}>
          <SeatPlaque
            side="attackers"
            name={name('attackers')}
            active={!state.result && state.toMove === 'attackers'}
            align="left"
          />
          {!state.result && (mode.kind === 'hotseat' || actingSide !== undefined) ? (
            <Button
              size="small"
              color="inherit"
              onClick={() => setConfirmResign(true)}
              sx={{ flexShrink: 0, opacity: 0.7, minWidth: 64 }}
            >
              Resign
            </Button>
          ) : (
            <Box sx={{ width: 64, flexShrink: 0 }} />
          )}
          <SeatPlaque
            side="defenders"
            name={name('defenders')}
            active={!state.result && state.toMove === 'defenders'}
            align="right"
          />
        </Stack>
      </Stack>

      <Dialog open={confirmResign} onClose={() => setConfirmResign(false)} aria-labelledby="resign-title">
        <DialogTitle id="resign-title">Resign?</DialogTitle>
        <DialogContent>
          <Typography>
            {mode.kind === 'hotseat'
              ? `${name(state.toMove)} concede — ${name(otherSide(state.toMove))} win.`
              : 'Your opponent wins the game.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResign(false)}>Keep playing</Button>
          <Button color="error" onClick={resign}>
            Resign
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={state.result !== null} aria-labelledby="over-title">
        <DialogTitle id="over-title">Game over</DialogTitle>
        <DialogContent>
          <Typography data-testid="outcome">{outcomeText(state, mode)}</Typography>
        </DialogContent>
        <DialogActions>
          {mode.kind === 'hotseat' ? (
            <Button
              onClick={() => {
                void session.reset(session.options ?? { timeControl: null });
              }}
            >
              Play again
            </Button>
          ) : (
            onRematch && <Button onClick={onRematch}>Rematch</Button>
          )}
          <Button onClick={onExit}>Done</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}

export { useSessionState };
