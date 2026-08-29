// Lex lobby presentation (T4.7, DESIGN §7.1): the grouped game list now lives
// in @parlor/web/lobby-ui — this file binds lex's three slots (the MiniBoard
// thumbnail, the "You 24 · Sam 18 — Sam played QUIZ +68" caption, and the
// empty-state tile motif) and re-exports the bound LobbyView. The lobby summary
// EXTENDS parlor's generic LobbySummary with lex's card fields. Firebase-free.
import { Box, Button, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { Seat } from '@lex/engine';
import { parsePublic, RULESETS } from '@lex/engine';
import { makeLobby, relativeTime, type LobbySummary } from '@parlor/web/lobby-ui';
import { useMemo } from 'react';
import { MiniBoard } from '../board/MiniBoard';
import { skinVars } from '../board/skin';
import { useSkinId } from '../board/skinContext';
import { Tile } from '../board/Tile';

export interface LobbyGameSummary extends LobbySummary {
  mySeat: Seat;
  toMove: Seat;
  /** games/{id}.public — renders the thumbnail without replaying. Absent while
   * a 3+ room is still a guest list: there is no state until it starts. */
  public?: string;
  rulesetId: string;
  scores: readonly number[];
  /** Lobby-card copy: the most recent play (word + score). */
  lastPlay?: { by: Seat; word: string; score: number };
}

export { relativeTime };
export { timeLeft } from '../game/clock';

function Thumbnail({ game }: { game: LobbyGameSummary }) {
  // LobbyList renders the thumbnail for EVERY card, including an open 3+ room
  // that has no `public` yet — so this falls back to the empty board rather
  // than taking the whole lobby down inside parsePublic.
  const board = useMemo(
    () => (game.public === undefined ? undefined : parsePublic(game.public).board),
    [game.public],
  );
  return <MiniBoard rulesetId={game.rulesetId} {...(board ? { tiles: board } : {})} />;
}

/** "You 24 · Sam 18 · Lee 31" plus the last play — the lex card's second line.
 *  Always me first, then the other seats in turn order. Exported for its unit
 *  test; the card itself reaches it through `renderCaption`. */
export function cardCaption(game: LobbyGameSummary, now: number): string {
  const seatCount = game.seatCount ?? 2;
  // A room that hasn't started has no scores to show — say where it stands.
  if (game.status === 'open' && seatCount > 2) {
    const filled = seatCount - (game.openSeats ?? 0);
    return `${filled} of ${seatCount} players — waiting to start`;
  }
  const nameOf = (seat: number): string =>
    (game.opponents
      ? game.opponents.find((o) => o.seat === seat)?.name
      : game.opponentName) ?? 'them';
  const others = Array.from({ length: seatCount }, (_, seat) => seat).filter(
    (seat) => seat !== game.mySeat,
  );
  const scores = [
    `You ${game.scores[game.mySeat] ?? 0}`,
    ...others.map((seat) => `${nameOf(seat)} ${game.scores[seat] ?? 0}`),
  ].join(' · ');
  if (game.lastPlay) {
    const who = game.lastPlay.by === game.mySeat ? 'You' : nameOf(game.lastPlay.by);
    return `${scores} — ${who} played ${game.lastPlay.word} +${game.lastPlay.score}`;
  }
  return `${scores} · ${relativeTime(game.updatedAtMs, now)}`;
}

/** A real empty state (T6.2): tile motif + headline + what-to-do copy + the
 * primary CTA. The tile points come from the classic ruleset — decoration, but
 * never made up. */
function LobbyEmpty({ onNewGame }: { onNewGame?: (() => void) | undefined }) {
  const mode = useTheme().palette.mode;
  const skin = useSkinId();
  const points = RULESETS['classic']!.tiles.points;
  return (
    <Stack alignItems="center" spacing={1} sx={{ mt: 6, textAlign: 'center' }} data-testid="lobby-empty">
      <Box aria-hidden sx={{ ...skinVars(mode, skin), '--lex-cell': '44px', display: 'flex', gap: 0.5, mb: 1 }}>
        {(['P', 'L', 'A', 'Y'] as const).map((letter) => (
          <Tile key={letter} letter={letter} isBlank={false} points={points[letter] ?? 0} />
        ))}
      </Box>
      <Typography variant="h6" component="p">
        No games yet
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 340 }}>
        Start one and send your friend the invite link — or challenge them by name.
      </Typography>
      {onNewGame && (
        <Button variant="contained" size="large" onClick={onNewGame} sx={{ mt: 1.5 }}>
          Start a new game
        </Button>
      )}
    </Stack>
  );
}

const lobby = makeLobby<LobbyGameSummary>({
  renderThumbnail: (game) => <Thumbnail game={game} />,
  renderCaption: (game, now) => cardCaption(game, now),
  renderEmpty: (onNewGame) => <LobbyEmpty onNewGame={onNewGame} />,
});

export const GameCard = lobby.GameCard;
export const ChallengeCard = lobby.ChallengeCard;
export const LobbyView = lobby.LobbyView;
