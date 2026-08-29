// @parlor/web/lobby-ui — the shared lobby/landing presentation for parlor
// games: the grouped game list, the turn badge, the invite/waiting screens, the
// landing shell, the join surface, and the 3+ game room (guest list, turn
// order, start). Firebase-free and game-agnostic — each
// game injects its board thumbnail, card caption, empty motif, landing hero,
// and option chips; everything else is shared. (parlor/README §web.)
export {
  actionableCount,
  finalStandings,
  friendsFrom,
  isWinner,
  placingOf,
  relativeTime,
  timeLeft,
  type Friend,
  type LobbySummary,
  type Opponent,
} from './summary';
export { applyTurnBadge, makeTurnBadge } from './turnBadge';
export { makeLobby, type LobbyConfig } from './LobbyList';
export {
  ChallengeReceived,
  InviteLinkView,
  InviteShare,
  WaitingForOpponent,
} from './invite';
export { Landing, LandingLayout } from './landing';
export { JoinByCodeButton, JoinCard, OptionChip, type JoinState } from './join';
export {
  arrangedOrder,
  canStart,
  hostOf,
  isHost,
  moveInOrder,
  openSeats,
  type GuestList,
  type RosterEntry,
  type TurnOrderChoice,
} from './roster';
export {
  GameRoom,
  GuestListView,
  InvitationReceived,
  StartGameBar,
  TurnOrderPicker,
  type SeatToggleValue,
  type TurnOrderPickerProps,
} from './room';
