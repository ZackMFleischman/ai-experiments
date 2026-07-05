// ported from hive/packages/app/src/sync/pushState.ts (adapted)
// Push-permission UX decisions. Pure and firebase-free so it unit-tests
// directly; the NotificationsSetup container feeds it reality.
export interface PushEnv {
  permission: NotificationPermission | 'unsupported';
  /** display-mode: standalone (installed PWA). */
  standalone: boolean;
  isIos: boolean;
  /** firebase/messaging isSupported() — false on iOS Safari tabs. */
  messagingSupported: boolean;
  coachMarkDismissed: boolean;
}

export type PushSetup = 'enable-button' | 'coach-mark' | 'nothing';

export function pushSetupState(env: PushEnv): PushSetup {
  // iOS requires a Home-Screen install for Web Push (16.4+): coach it once.
  if (env.isIos && !env.standalone && !env.messagingSupported) {
    return env.coachMarkDismissed ? 'nothing' : 'coach-mark';
  }
  if (!env.messagingSupported) return 'nothing';
  if (env.permission === 'default') return 'enable-button';
  return 'nothing'; // granted (silent token capture) or denied (in-app badges)
}
