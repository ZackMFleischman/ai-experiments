// tafl's lobby presentation: the grouped game list lives in
// @parlor/web/lobby-ui — this file binds tafl's three slots (the MiniBoard
// thumbnail, the sides caption, and the empty-state motif) and re-exports
// the bound LobbyView. Firebase-free.
import { Box, Button, Stack, Typography } from '@mui/material';
import { makeLobby, relativeTime, type LobbySummary } from '@parlor/web/lobby-ui';
import { initialTafl } from '@tafl/engine';
import { MiniBoard } from '../board/MiniBoard';
import { sideLabel } from '../gameOptions';

export interface LobbyGameSummary extends LobbySummary {
  /** My side, by seat index (0 = attackers). */
  mySeat: 0 | 1;
  toMove: 0 | 1;
  /** games/{id}.state — the serialized engine state; board renders without
   * replaying the log. */
  board: string;
  moveCount: number;
}

function cardCaption(game: LobbyGameSummary, now: number): string {
  const side = sideLabel(game.mySeat === 0 ? 'attackers' : 'defenders');
  const moves = `${game.moveCount} move${game.moveCount === 1 ? '' : 's'}`;
  return `You play ${side} · ${moves} · ${relativeTime(game.updatedAtMs, now)}`;
}

function LobbyEmpty({ onNewGame }: { onNewGame?: (() => void) | undefined }) {
  return (
    <Stack alignItems="center" spacing={1} sx={{ mt: 6, textAlign: 'center' }} data-testid="lobby-empty">
      <Box aria-hidden sx={{ mb: 1 }}>
        <MiniBoard board={initialTafl().board} size={88} />
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
  renderThumbnail: (game) => <MiniBoard board={game.board} />,
  renderCaption: (game, now) => cardCaption(game, now),
  renderEmpty: (onNewGame) => <LobbyEmpty onNewGame={onNewGame} />,
});

export const GameCard = lobby.GameCard;
export const ChallengeCard = lobby.ChallengeCard;
export const LobbyView = lobby.LobbyView;
