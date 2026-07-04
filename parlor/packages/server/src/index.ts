// @parlor/server — shared game callables (create/join/cancel/challenge/
// respond/rematch/resign), notify, and callable helpers, all shaped by an
// injected GameServerConfig. firebase-admin / firebase-functions are
// peerDependencies provided by the consuming game's functions package.
export {
  createGameCallables,
  type GameCallables,
  type GameServerConfig,
  type InitialGame,
} from './games';
export {
  INVITE_TTL_MS,
  deadlineFor,
  makeCode,
  parseTimeControlDays,
  requireAuth,
  requireGameId,
  type Caller,
} from './helpers';
export {
  countActionable,
  createNotify,
  sendPush,
  type Notify,
  type NotifyConfig,
  type PushPayload,
  type PushTransport,
  type SharedTrigger,
  type TriggerArgs,
} from './notify';

/** Wiring probe (T0.1 cross-workspace link test). */
export const PARLOR_SERVER = { workspace: 'parlor', package: 'server' } as const;
