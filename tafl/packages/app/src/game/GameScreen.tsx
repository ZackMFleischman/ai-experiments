// The shared game surface: one board screen over a LogSession, used by both
// hot-seat (acting side follows the turn) and online (perspective locked to
// my side). Wears the house play chrome (DESIGN-PRINCIPLES §1–2): AppShell
// bar, the shared GameHud (seat plaques carry the accent on the active
// side, tafl passes its own piece glyphs), then the 11×11 board edge to
// edge and centered in the leftover space — play screens never scroll. The
// UI folds engine state only; every mutation is a log entry through the
// session.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AppShell, GameHud, type HudSeat } from '@parlor/brand';
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

  const seat = (side: Side): HudSeat => ({
    label: name(side),
    glyph: (
      <Box
        component="span"
        aria-hidden
        sx={{ width: 14, height: 14, display: 'inline-grid', placeItems: 'center' }}
      >
        <PieceGlyph piece={side === 'attackers' ? 'A' : 'D'} size="13px" />
      </Box>
    ),
    active: !state.result && state.toMove === side,
  });

  return (
    <AppShell title="Tafl" onBack={onExit} fullBleed>
      <Stack
        spacing={1.25}
        sx={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: { xs: '100%', sm: 640 },
          mx: 'auto',
          px: { xs: 1, sm: 2 },
          pb: { xs: 1.5, sm: 2 },
          pt: 0.5,
        }}
      >
        <GameHud
          seats={[seat('attackers'), seat('defenders')]}
          status={statusLine}
          meta={`move ${state.moveCount + 1}`}
        />

        {/* The board owns the leftover space (§1): full width on phones,
            clamped to the viewport height so the screen never scrolls. */}
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

        {/* One quiet control row below the play area. */}
        <Stack direction="row" spacing={1} justifyContent="center" sx={{ minHeight: 32 }}>
          {!state.result && (mode.kind === 'hotseat' || actingSide !== undefined) && (
            <Button size="small" color="inherit" onClick={() => setConfirmResign(true)}>
              Resign
            </Button>
          )}
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
