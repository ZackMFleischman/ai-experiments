// ported from hive/packages/app/src/screens/lobbyView.tsx (adapted)
// The shared lobby presentation: challenges / your-turn / waiting / finished
// groups, the game card (opponent, relative time, your-turn/deadline/result
// chips), and the incoming-challenge card. Firebase-free — the game's sync
// container feeds it summaries; the gallery feeds it fixtures.
//
// `makeLobby(config)` binds the three game-specific slots — the board
// thumbnail, the card's second-line caption (scores / last play), and the
// empty state — and returns the bound components. Everything else (grouping,
// chips, challenge accept/decline) is generic.
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import {
  Button,
  Card,
  CardActionArea,
  CardActions,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { relativeTime, timeLeft, type LobbySummary } from './summary';

export interface LobbyConfig<T extends LobbySummary> {
  /** The board thumbnail for a game card (e.g. a mini board). Omit for none. */
  renderThumbnail?: (game: T) => ReactNode;
  /** The card's second line for active/finished games — scores, last play. */
  renderCaption: (game: T, now: number) => ReactNode;
  /** The empty-lobby state (motif + CTA). A minimal default is used if omitted. */
  renderEmpty?: (onNewGame?: () => void) => ReactNode;
}

function resultChip<T extends LobbySummary>(game: T) {
  if (game.status !== 'finished' || !game.result) return null;
  const mine = game.result === (game.mySeat === 0 ? 'p0' : 'p1');
  const label = game.result === 'draw' ? 'Draw' : mine ? 'Won' : 'Lost';
  const color = game.result === 'draw' ? 'default' : mine ? 'success' : 'error';
  return <Chip size="small" label={label} color={color} data-testid="result-chip" />;
}

function DefaultEmpty({ onNewGame }: { onNewGame?: (() => void) | undefined }) {
  return (
    <Stack alignItems="center" spacing={1} sx={{ mt: 6, textAlign: 'center' }} data-testid="lobby-empty">
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

export function makeLobby<T extends LobbySummary>(config: LobbyConfig<T>) {
  function GameCard({ game, now, onOpen }: { game: T; now: number; onOpen: (id: string) => void }) {
    const yourTurn = game.status === 'active' && game.toMove === game.mySeat;
    return (
      <Card variant="outlined">
        <CardActionArea
          onClick={() => onOpen(game.id)}
          sx={{ p: 1.5 }}
          data-testid={`game-card-${game.id}`}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            {config.renderThumbnail?.(game)}
            <Stack sx={{ minWidth: 0, flex: 1 }} spacing={0.5}>
              <Typography fontWeight={600} noWrap>
                {game.opponentName ?? 'Open invite'}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  // The caption carries scores + last play — clamp to two lines
                  // rather than truncating it away on phones.
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {game.status === 'open'
                  ? `Invite out · ${relativeTime(game.updatedAtMs, now)}`
                  : config.renderCaption(game, now)}
              </Typography>
            </Stack>
            {game.status === 'active' && (
              // Stacked, not side by side: two chips in a row starve the caption
              // at 390px until the last play clamps away entirely. The clock
              // rides both your-turn and waiting cards — it's the CURRENT
              // player's deadline either way.
              <Stack spacing={0.5} alignItems="center">
                {yourTurn && (
                  <Chip size="small" color="primary" label="Your turn" data-testid="your-turn-chip" />
                )}
                {game.deadlineAtMs !== undefined && (
                  <Chip
                    size="small"
                    variant="outlined"
                    color={yourTurn ? 'primary' : 'default'}
                    icon={<AccessTimeRoundedIcon />}
                    label={timeLeft(game.deadlineAtMs, now)}
                    data-testid="deadline-chip"
                  />
                )}
              </Stack>
            )}
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
  function ChallengeCard({
    game,
    onRespond,
  }: {
    game: T;
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
            You&apos;d go {game.mySeat === 0 ? 'first' : 'second'}
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

  function LobbyView({
    games,
    now,
    onOpen,
    onRespondChallenge,
    onNewGame,
  }: {
    games: T[];
    now: number;
    onOpen: (id: string) => void;
    onRespondChallenge?: (id: string, accept: boolean) => void;
    /** Empty-state CTA target — the container routes it to the new-game flow. */
    onNewGame?: () => void;
  }) {
    const challenges = games.filter(
      (g) => g.status === 'open' && g.challenge?.direction === 'incoming',
    );
    const yourTurn = games.filter((g) => g.status === 'active' && g.toMove === g.mySeat);
    const waiting = games.filter(
      (g) =>
        (g.status === 'open' && g.challenge?.direction !== 'incoming') ||
        (g.status === 'active' && g.toMove !== g.mySeat),
    );
    const finished = games.filter((g) => g.status === 'finished');

    if (games.length === 0) {
      return <>{config.renderEmpty ? config.renderEmpty(onNewGame) : <DefaultEmpty onNewGame={onNewGame} />}</>;
    }

    const section = (title: string, list: T[], testid: string) =>
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
              <ChallengeCard
                key={g.id}
                game={g}
                onRespond={(id, accept) => onRespondChallenge?.(id, accept)}
              />
            ))}
          </Stack>
        )}
        {section('Your turn', yourTurn, 'group-your-turn')}
        {section('Waiting on opponent', waiting, 'group-waiting')}
        {section('Finished', finished, 'group-finished')}
      </Stack>
    );
  }

  return { LobbyView, GameCard, ChallengeCard };
}
