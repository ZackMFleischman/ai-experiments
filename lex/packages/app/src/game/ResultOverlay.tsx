// Result overlay (T3.10 / T7.16, DESIGN §7.4): headline + reason, the final
// standings podium (winner first at every seat count, with the end-adjustment
// line items), stats, and actions. Everything shown was computed by the
// engine/server — display only. In particular the podium RENDERS the standings
// it is given and never re-orders them: withdrawn players rank below everyone
// who finished even when their frozen score is higher (DECISIONS 2026-08-28).
import { Box, Button, Dialog, DialogContent, Stack, Typography } from '@mui/material';
import type { Seat } from '@lex/engine';
import { useState } from 'react';
import type { GameEnd, SheetRow } from '../controller/GameController';
import { formatScore, ordinal } from './score';

export interface ResultOverlayProps {
  open: boolean;
  end: GameEnd;
  names: readonly string[];
  sheet: readonly SheetRow[];
  /** The reader's seat — the rematch line names everyone ELSE it invites.
   * Two-seat games never show that line, so it is optional. */
  mySeat?: Seat;
  onRematch: () => void;
  onViewBoard: () => void;
  onBackToLobby?: () => void;
}

/** The placings to render: the engine's/server's, or — for an end built
 * before they travelled — the two-seat form of the same thing (the shape
 * `@parlor/web`'s `finalStandings` falls back to). Never a fresh ranking. */
function placingsOf(end: GameEnd): readonly (readonly Seat[])[] {
  if (end.standings && end.standings.length > 0) return end.standings;
  const seats = end.finalScores.map((_score, seat) => seat);
  if (end.winner === 'draw') return [seats];
  return [[end.winner], seats.filter((seat) => seat !== end.winner)];
}

/** "Ada", "Ada and Sam", "Ada, Sam and Noor". */
function listNames(seats: readonly Seat[], names: readonly string[]): string {
  const shown = seats.map((seat) => names[seat] ?? `Player ${seat + 1}`);
  if (shown.length <= 1) return shown[0] ?? '';
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

function headline(end: GameEnd, names: readonly string[]): { title: string; reason: string } {
  const name = (seat: number) => names[seat] ?? `Player ${seat + 1}`;
  // "You win!", not "You wins!" — the M4 perspective naming uses "You".
  const wins = (seat: number, bang = false) =>
    `${name(seat)} win${name(seat) === 'You' ? '' : 's'}${bang ? '!' : ''}`;
  switch (end.by) {
    case 'played-out':
    case 'scoreless':
    case 'last-standing': {
      const reason =
        end.by === 'played-out'
          ? 'Played out!'
          : end.by === 'scoreless'
            ? 'Scoreless limit reached'
            : 'Last player standing';
      if (end.winner === 'draw') {
        const top = placingsOf(end)[0] ?? [];
        // Everyone level is a draw; a shared top at a bigger table is a tie
        // between those players, so name them rather than say "apiece".
        if (top.length === end.finalScores.length) {
          return { title: `Draw — ${formatScore(end.finalScores[top[0] ?? 0] ?? 0)} apiece`, reason };
        }
        return { title: `${listNames(top, names)} tie for the win`, reason };
      }
      return { title: wins(end.winner, true), reason };
    }
    case 'resign':
      return { title: wins(end.winner), reason: `${name(end.winner === 0 ? 1 : 0)} resigned` };
    case 'timeout':
      return { title: wins(end.winner), reason: 'Won on time' };
  }
}

/**
 * The podium: one row per player in FINAL order — the winner first, tied
 * players sharing a placing, and the withdrawn where the standings put them
 * (last, however high their frozen score). Each row carries its placing, name,
 * final score, and the end-adjustment line item that made it.
 */
export function FinalStandings({ end, names }: { end: GameEnd; names: readonly string[] }) {
  const adjustments = 'adjustments' in end ? end.adjustments : undefined;
  const withdrawn = end.withdrawn ?? [];
  return (
    <Stack spacing={0.5} sx={{ mb: 3 }} data-testid="final-standings">
      {placingsOf(end).flatMap((tied, index) =>
        tied.map((seat) => {
          const place = index + 1;
          const out = withdrawn.includes(seat);
          return (
            <Box
              key={seat}
              data-testid={`result-seat-${seat}`}
              data-placing={place}
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 1.5,
                textAlign: 'left',
                // The winner's row is the one the eye should land on after the
                // headline; a withdrawn row is muted by COLOR, not opacity
                // (the 4.5:1 floor), exactly as in the player bar.
                ...(place === 1 && !out && { bgcolor: 'action.selected' }),
                ...(out && { color: 'text.secondary' }),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  component="span"
                  data-testid={`result-placing-${seat}`}
                  aria-label={`${ordinal(place)} place`}
                  sx={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 34,
                    px: 0.5,
                    py: 0.125,
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    // Same treatment as the player bar's leading numeral: a
                    // FILLED accent pill, not accent-on-accent. `primary.main`
                    // text over the winner row's `action.selected` wash is
                    // legible in light and washes out in dark; contrastText on
                    // a filled pill holds 4.5:1 in both.
                    ...(place === 1 && !out
                      ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
                      : { color: 'text.secondary' }),
                  }}
                >
                  {ordinal(place)}
                </Box>
                <Typography noWrap sx={{ fontWeight: place === 1 ? 800 : 600, minWidth: 0 }}>
                  {names[seat] ?? `Player ${seat + 1}`}
                </Typography>
                {out && (
                  <Box
                    component="span"
                    data-testid={`result-withdrawn-${seat}`}
                    sx={{
                      flexShrink: 0,
                      px: 0.5,
                      borderRadius: 0.75,
                      border: 1,
                      borderColor: 'divider',
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    out
                  </Box>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Typography
                  data-testid={`result-score-${seat}`}
                  sx={{ fontWeight: 800, flexShrink: 0 }}
                >
                  {formatScore(end.finalScores[seat] ?? 0)}
                </Typography>
              </Box>
              {adjustments && adjustments[seat] !== 0 && (
                <Typography variant="caption" color="text.secondary" data-testid="adjustment-line">
                  {adjustments[seat]! > 0
                    ? `+${adjustments[seat]} from unplayed racks`
                    : `−${Math.abs(adjustments[seat]!)} unplayed tiles`}
                </Typography>
              )}
              {out && (
                // Why a bigger frozen score still placed here — the ranking
                // rule, said on the row it applies to.
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  data-testid={`result-withdrawn-note-${seat}`}
                >
                  Left the game — placed below everyone who finished
                </Typography>
              )}
            </Box>
          );
        }),
      )}
    </Stack>
  );
}

export function ResultOverlay({
  open,
  end,
  names,
  sheet,
  mySeat,
  onRematch,
  onViewBoard,
  onBackToLobby,
}: ResultOverlayProps) {
  const { title, reason } = headline(end, names);
  const biggest = sheet
    .filter((row) => row.kind === 'play')
    .reduce<SheetRow | null>((best, row) => (row.score > (best?.score ?? -1) ? row : best), null);
  const moves = sheet.filter((row) => row.kind === 'play' || row.kind === 'exchange' || row.kind === 'pass').length;

  // A rematch at a table invites EVERYONE — the server rotates the order by one
  // and deals the lot — so at 3+ the action says who it pulls back in, and
  // offers the way out. Two seats keep the plain Rematch button they had.
  const seats = end.finalScores.length;
  const table = seats > 2;
  const others = end.finalScores
    .map((_score, seat) => seat)
    .filter((seat) => seat !== mySeat);
  const [optedOut, setOptedOut] = useState(false);

  return (
    <Dialog open={open} fullWidth maxWidth="xs">
      <DialogContent data-testid="result-overlay" sx={{ textAlign: 'center', pt: 4 }}>
        <Typography
          variant="h4"
          component="p"
          sx={{
            fontWeight: 800,
            // Victory beat (T6.2): one gentle pop. CSS-only, so the gallery's
            // ?static=1 freeze and reduced-motion both neutralize it.
            '@keyframes lexHeadlinePop': {
              from: { opacity: 0, transform: 'scale(0.85)' },
              to: { opacity: 1, transform: 'none' },
            },
            animation: 'lexHeadlinePop 0.35s ease-out backwards',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {reason}
        </Typography>

        <FinalStandings end={end} names={names} />

        <Typography variant="body2" color="text.secondary" data-testid="result-stats" sx={{ mb: 3 }}>
          {moves} moves
          {biggest?.word ? ` · biggest word ${biggest.word} +${biggest.score}` : ''}
        </Typography>

        <Stack spacing={1} alignItems="center">
          <Stack direction="row" spacing={1} justifyContent="center">
            {!(table && optedOut) && (
              <Button variant="contained" onClick={onRematch} data-testid="rematch-action">
                {table ? `Rematch all ${seats}` : 'Rematch'}
              </Button>
            )}
            <Button onClick={onViewBoard}>View board</Button>
            {onBackToLobby && <Button onClick={onBackToLobby}>Back to lobby</Button>}
          </Stack>
          {table &&
            (optedOut ? (
              <Typography variant="caption" color="text.secondary" data-testid="rematch-opted-out">
                Sitting this one out — {listNames(others, names)} can start another without you.
              </Typography>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" data-testid="rematch-invites">
                  Invites {listNames(others, names)} — the order rotates, so{' '}
                  {names[1] ?? 'Player 2'} opens.
                </Typography>
                <Button size="small" onClick={() => setOptedOut(true)} data-testid="rematch-opt-out">
                  Not this time
                </Button>
              </>
            ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
