// Hive waiting/invite presentation: the share block, waiting-for-opponent
// screen, and the challenged-player's accept/decline screen all live in
// @parlor/web/lobby-ui now. This file re-exports them — hive's accept copy is
// parlor's default ("Accept to take the open seat — the game starts right
// away."), so no slot override is needed. Firebase-free.
export { ChallengeReceived, InviteShare, WaitingForOpponent } from '@parlor/web/lobby-ui';
