// Lex waiting/invite presentation: the share block, waiting screen, and the
// challenged-player screen all live in @parlor/web/lobby-ui now. This file
// re-exports them, injecting lex's rack-aware accept copy (§8.10 — the board
// and your rack stay withheld until the opponent accepts). Firebase-free.
import { ChallengeReceived as ParlorChallengeReceived } from '@parlor/web/lobby-ui';

export { InviteShare, WaitingForOpponent } from '@parlor/web/lobby-ui';

export function ChallengeReceived(props: {
  name: string;
  onRespond: (accept: boolean) => void;
  busy?: boolean;
}) {
  return <ParlorChallengeReceived {...props} blurb="Accept to take the open seat — your rack is waiting." />;
}
