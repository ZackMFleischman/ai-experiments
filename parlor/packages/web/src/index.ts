// @parlor/web — firebase init, auth context, lobby queries, providers (React).
// react / firebase / MUI are peerDependencies: the consuming game provides
// them. This root entry is FIREBASE-FREE by construction — a consumer's static
// hot-seat bundle imports it for the auth seam without pulling the SDK; the
// firebase-backed surfaces live behind subpath exports
// (./firebase, ./gameApi, ./lobby, ./AppSyncProviders).
export {
  AuthContext,
  HOTSEAT_AUTH,
  useAuth,
  type AppUser,
  type AuthValue,
} from './authContext';
export { RequireAuth } from './RequireAuth';

/** Wiring probe (T0.1 cross-workspace link test). */
export const PARLOR_WEB = { workspace: 'parlor', package: 'web' } as const;
