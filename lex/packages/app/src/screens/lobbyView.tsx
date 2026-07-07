// ported from hive/packages/app/src/screens/lobbyView.tsx (adapted)
// Lobby presentation (T4.7, DESIGN §7.1): challenges / your-turn / waiting /
// finished groups; cards carry the scores and the last play ("Sam played
// QUIZ +68"). Firebase-free — the sync container (sync/OnlineGames) feeds
// it; the gallery feeds it fixtures.
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
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
import { useTheme } from '@mui/material/styles';
import type { Seat } from '@lex/engine';
import { parsePublic, RULESETS } from '@lex/engine';
import { useMemo } from 'react';
import { MiniBoard } from '../board/MiniBoard';
import { skinVars } from '../board/skin';
import { useSkinId } from '../board/skinContext';
import { Tile } from '../board/Tile';
import { timeLeft } from '../game/clock';

export interface LobbyGameSummary {
  id: string;
  mySeat: Seat;
  opponentName: string | null;
  status: 'open' | 'active' | 'finished';
  toMove: Seat;
  result?: 'p0' | 'p1' | 'draw';
  endedBy?: string;
  updatedAtMs: number;
  /** Async clock (T5.5): move deadline, when the game has a time control. */
  deadlineAtMs?: number;
  /** games/{id}.public — renders the thumbnail without replaying. */
  public: string;
  rulesetId: string;
  scores: readonly number[];
  /** Lobby-card copy: the most recent play (word + score). */
  lastPlay?: { by: Seat; word: string; score: number };
  /** The other player's uid where known — feeds the new-game friend picker. */
  opponentUid?: string;
  /** Direct challenge while open (DESIGN §6.2): who challenged whom. */
  challenge?: { direction: 'incoming' | 'outgoing'; name: string };
  /** Active at move zero, activated by the opponent (accepted invite/challenge,
   * rematch offer) — counts toward the badge even before it's my move. */
  freshFromOpponent?: boolean;
}

export { timeLeft } from '../game/clock';

export function relativeTime(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Thumbnail({ game }: { game: LobbyGameSummary }) {
  const board = useMemo(() => parsePublic(game.public).board, [game.public]);
  return <MiniBoard rulesetId={game.rulesetId} tiles={board} />;
}

function resultChip(game: LobbyGameSummary) {
  if (game.status !== 'finished' || !game.result) return null;
  const mine = game.result === (game.mySeat === 0 ? 'p0' : 'p1');
  const label = game.result === 'draw' ? 'Draw' : mine ? 'Won' : 'Lost';
  const color = game.result === 'draw' ? 'default' : mine ? 'success' : 'error';
  return <Chip size="small" label={label} color={color} data-testid="result-chip" />;
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

export function GameCard({
  game,
  now,
  onOpen,
}: {
  game: LobbyGameSummary;
  now: number;
  onOpen: (id: string) => void;
}) {
  const yourTurn = game.status === 'active' && game.toMove === game.mySeat;
  return (
    <Card variant="outlined">
      <CardActionArea
        onClick={() => onOpen(game.id)}
        sx={{ p: 1.5 }}
        data-testid={`game-card-${game.id}`}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Thumbnail game={game} />
          <Stack sx={{ minWidth: 0, flex: 1 }} spacing={0.5}>
            <Typography fontWeight={600} noWrap>
              {game.opponentName ?? 'Open invite'}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                // The caption carries scores + last play (DESIGN §7.1) —
                // clamp to two lines rather than truncating it away on phones.
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {game.status === 'open'
                ? `Invite out · ${relativeTime(game.updatedAtMs, now)}`
                : cardCaption(game, now)}
            </Typography>
          </Stack>
          {game.status === 'active' && (
            // Stacked, not side by side: two chips in a row starve the caption
            // at 390px until the last play clamps away entirely (T6.3). The
            // clock rides both your-turn and waiting cards — it's the CURRENT
            // player's deadline either way, so you can see the opponent's clock
            // running down too, not just your own.
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

/** A real empty state (T6.2): tile motif + headline + what-to-do copy + the
 * primary CTA (the corner FAB alone is too subtle for a first visit). The
 * tile points come from the classic ruleset — decoration, but never made up. */
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

export function LobbyView({
  games,
  now,
  onOpen,
  onRespondChallenge,
  onNewGame,
}: {
  games: LobbyGameSummary[];
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

  if (games.length === 0) return <LobbyEmpty onNewGame={onNewGame} />;

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
