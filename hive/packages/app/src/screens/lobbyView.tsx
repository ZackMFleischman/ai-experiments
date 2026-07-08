// Hive lobby presentation (T4.7, DESIGN §6.1): the grouped game list now lives
// in @parlor/web/lobby-ui — this file binds hive's three slots (the hex
// BoardView thumbnail, the "You play white · 3h ago" caption, and the empty
// motif) and re-exports the bound LobbyView. The lobby summary EXTENDS parlor's
// generic seat-index LobbySummary, mapping white→seat 0 / black→seat 1 in
// sync/lobby.ts. Firebase-free — the sync container feeds it summaries; the
// gallery feeds it fixtures.
import { Box, Typography } from '@mui/material';
import { deserializeState } from '@hive/engine';
import { makeLobby, relativeTime, timeLeft, type LobbySummary } from '@parlor/web/lobby-ui';
import { useMemo } from 'react';
import { BoardView } from '../board/BoardView';

export interface LobbyGameSummary extends LobbySummary {
  /** games/{id}.state — renders the hex thumbnail without replaying. */
  state: string;
}

export { relativeTime, timeLeft };

function Thumbnail({ state }: { state: string }) {
  const board = useMemo(() => deserializeState(state).board, [state]);
  return (
    <Box
      aria-hidden
      sx={{ width: 84, height: 84, pointerEvents: 'none', flexShrink: 0, '& svg': { width: '100%', height: '100%' } }}
    >
      <BoardView board={board} />
    </Box>
  );
}

/** "You play white · 3h ago", the hive card's second line. Seats map back to
 * colors for the copy (seat 0 = white). */
function cardCaption(game: LobbyGameSummary, now: number): string {
  return `You play ${game.mySeat === 0 ? 'white' : 'black'} · ${relativeTime(game.updatedAtMs, now)}`;
}

function LobbyEmpty() {
  return (
    <Typography color="text.secondary" sx={{ mt: 3 }} data-testid="lobby-empty">
      No games yet — start one and send your friend the invite link.
    </Typography>
  );
}

const lobby = makeLobby<LobbyGameSummary>({
  renderThumbnail: (game) => <Thumbnail state={game.state} />,
  renderCaption: (game, now) => cardCaption(game, now),
  renderEmpty: () => <LobbyEmpty />,
});

export const GameCard = lobby.GameCard;
export const ChallengeCard = lobby.ChallengeCard;
export const LobbyView = lobby.LobbyView;
