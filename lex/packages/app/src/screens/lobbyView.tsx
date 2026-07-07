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
  /** games/{id}.public — renders the thumbnail without replaying. */
  public: string;
  rulesetId: string;
  scores: readonly number[];
  /** Lobby-card copy: the most recent play (word + score). */
  lastPlay?: { by: Seat; word: string; score: number };
}

export { relativeTime };
export { timeLeft } from '../game/clock';

function Thumbnail({ game }: { game: LobbyGameSummary }) {
  const board = useMemo(() => parsePublic(game.public).board, [game.public]);
  return <MiniBoard rulesetId={game.rulesetId} tiles={board} />;
}

/** "You 24 · Sam 18" plus the last play, the lex card's second line. */
function cardCaption(game: LobbyGameSummary, now: number): string {
  const opp = game.opponentName ?? 'them';
  const mine = game.scores[game.mySeat] ?? 0;
  const theirs = game.scores[game.mySeat === 0 ? 1 : 0] ?? 0;
  const scores = `You ${mine} · ${opp} ${theirs}`;
  if (game.lastPlay) {
    const who = game.lastPlay.by === game.mySeat ? 'You' : opp;
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
