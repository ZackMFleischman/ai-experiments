// Lobby presentation (T4.7, DESIGN §6.1): your-turn / waiting / finished
// groups, opponent, mini board thumbnail, result chips. Firebase-free — the
// sync container (sync/OnlineGames) feeds it; the gallery feeds it fixtures.
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardActions,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import type { Color } from '@hive/engine';
import { deserializeState } from '@hive/engine';
import { useMemo } from 'react';
import { BoardView } from '../board/BoardView';

export interface LobbyGameSummary {
  id: string;
  myColor: Color;
  opponentName: string | null;
  status: 'open' | 'active' | 'finished';
  toMove: Color;
  result?: 'white' | 'black' | 'draw';
  endedBy?: string;
  updatedAtMs: number;
  /** Async clock (T5.5): move deadline, when the game has a time control. */
  deadlineAtMs?: number;
  /** games/{id}.state — renders the thumbnail without replaying. */
  state: string;
  /** The other player's uid where known — feeds the new-game friend picker. */
  opponentUid?: string;
  /** Direct challenge while open (DESIGN §5.2): who challenged whom. */
  challenge?: { direction: 'incoming' | 'outgoing'; name: string };
  /** Active at move zero, activated by the opponent (accepted invite/challenge,
   * rematch offer) — counts toward the badge even before it's my move. */
  freshFromOpponent?: boolean;
}

export function timeLeft(deadlineMs: number, nowMs: number): string {
  const h = Math.max(0, Math.round((deadlineMs - nowMs) / 3_600_000));
  if (h < 1) return 'expiring';
  if (h < 48) return `${h}h left`;
  return `${Math.round(h / 24)}d left`;
}

export function relativeTime(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

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

function resultChip(game: LobbyGameSummary) {
  if (game.status !== 'finished' || !game.result) return null;
  const mine = game.result === (game.myColor === 'w' ? 'white' : 'black');
  const label = game.result === 'draw' ? 'Draw' : mine ? 'Won' : 'Lost';
  const color = game.result === 'draw' ? 'default' : mine ? 'success' : 'error';
  return <Chip size="small" label={label} color={color} data-testid="result-chip" />;
}

export function GameCard({
  game,
  now,
  onOpen,
}: {
  game: LobbyGameSummary;
  now: number;
  onOpen: (id: string) => void;
}) {
  const yourTurn = game.status === 'active' && game.toMove === game.myColor;
  return (
    <Card variant="outlined">
      <CardActionArea
        onClick={() => onOpen(game.id)}
        sx={{ p: 1.5 }}
        data-testid={`game-card-${game.id}`}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Thumbnail state={game.state} />
          <Stack sx={{ minWidth: 0, flex: 1 }} spacing={0.5}>
            <Typography fontWeight={600} noWrap>
              {game.opponentName ?? 'Waiting for opponent…'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You play {game.myColor === 'w' ? 'white' : 'black'} ·{' '}
              {relativeTime(game.updatedAtMs, now)}
            </Typography>
          </Stack>
          {yourTurn && game.deadlineAtMs !== undefined && (
            <Chip
              size="small"
              variant="outlined"
              label={timeLeft(game.deadlineAtMs, now)}
              data-testid="deadline-chip"
            />
          )}
          {yourTurn && <Chip size="small" color="primary" label="Your turn" data-testid="your-turn-chip" />}
          {game.status === 'open' && (
            <Chip
              size="small"
              variant="outlined"
              label={game.challenge ? 'Challenge sent' : 'Invited'}
            />
          )}
          {resultChip(game)}
        </Stack>
      </CardActionArea>
    </Card>
  );
}

/** Incoming direct challenge: accept starts the game, decline removes it.
 * Buttons live outside the action area (no nested-button DOM). */
export function ChallengeCard({
  game,
  onRespond,
}: {
  game: LobbyGameSummary;
  onRespond: (id: string, accept: boolean) => void;
}) {
  return (
    <Card variant="outlined" data-testid={`challenge-card-${game.id}`}>
      {/* No thumbnail: a challenge is always move zero — an empty board says nothing. */}
      <Stack sx={{ minWidth: 0, p: 1.5, pb: 0 }} spacing={0.5}>
        <Typography fontWeight={600} noWrap>
          {game.challenge?.name ?? 'A friend'} challenges you
        </Typography>
        <Typography variant="body2" color="text.secondary">
          You&apos;d play {game.myColor === 'w' ? 'white' : 'black'}
        </Typography>
      </Stack>
      <CardActions sx={{ justifyContent: 'flex-end' }}>
        <Button
          color="error"
          onClick={() => onRespond(game.id, false)}
          data-testid={`challenge-decline-${game.id}`}
        >
          Decline
        </Button>
        <Button
          variant="contained"
          onClick={() => onRespond(game.id, true)}
          data-testid={`challenge-accept-${game.id}`}
        >
          Accept
        </Button>
      </CardActions>
    </Card>
  );
}

export function LobbyView({
  games,
  now,
  onOpen,
  onRespondChallenge,
}: {
  games: LobbyGameSummary[];
  now: number;
  onOpen: (id: string) => void;
  onRespondChallenge?: (id: string, accept: boolean) => void;
}) {
  const challenges = games.filter(
    (g) => g.status === 'open' && g.challenge?.direction === 'incoming',
  );
  const yourTurn = games.filter((g) => g.status === 'active' && g.toMove === g.myColor);
  const waiting = games.filter(
    (g) =>
      (g.status === 'open' && g.challenge?.direction !== 'incoming') ||
      (g.status === 'active' && g.toMove !== g.myColor),
  );
  const finished = games.filter((g) => g.status === 'finished');

  if (games.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ mt: 3 }} data-testid="lobby-empty">
        No games yet — start one and send your friend the invite link.
      </Typography>
    );
  }

  const section = (title: string, list: LobbyGameSummary[], testid: string) =>
    list.length > 0 && (
      <Stack spacing={1} data-testid={testid}>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        {list.map((g) => (
          <GameCard key={g.id} game={g} now={now} onOpen={onOpen} />
        ))}
      </Stack>
    );

  return (
    <Stack spacing={3} sx={{ mt: 2 }}>
      {challenges.length > 0 && (
        <Stack spacing={1} data-testid="group-challenges">
          <Typography variant="overline" color="text.secondary">
            Challenges
          </Typography>
          {challenges.map((g) => (
            <ChallengeCard key={g.id} game={g} onRespond={(id, accept) => onRespondChallenge?.(id, accept)} />
          ))}
        </Stack>
      )}
      {section('Your turn', yourTurn, 'group-your-turn')}
      {section('Waiting on opponent', waiting, 'group-waiting')}
      {section('Finished', finished, 'group-finished')}
    </Stack>
  );
}
