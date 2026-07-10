// @parlor/native — shared Capacitor glue for the brand's $1 store apps
// (MINIMALIST-APPS-STRATEGY.md §1.1, BRAND-IMPLEMENTATION.md Phase 3a).
// Everything here must no-op cleanly in a plain browser: the free PWA's
// behavior is unchanged by this package existing.
export {
  callPlugin,
  getBridge,
  isNative,
  nativePlatform,
  type CapacitorBridge,
} from './bridge.js';
export { usePremium } from './premium.js';
export {
  capacitorConfig,
  type BrandCapacitorApp,
  type BrandCapacitorConfig,
} from './capacitorConfig.js';
export {
  allowSleep,
  cancelNotification,
  hapticImpact,
  hapticNotification,
  hapticSelection,
  keepAwake,
  requestNotificationPermission,
  requestReview,
  scheduleNotification,
  shareContent,
  startBackgroundAudio,
  stopBackgroundAudio,
  syncStatusBar,
  type BackgroundAudioSource,
  type HapticImpactStyle,
  type HapticNotificationType,
  type LocalNotification,
  type ShareContent,
} from './plugins.js';
export {
  validateStoreListing,
  type ScreenshotDevice,
  type StoreListing,
  type StoreScreenshot,
} from './storeListing.js';

/** Wiring probe — consumers' cross-workspace import tests read this. */
export const PARLOR_NATIVE = { workspace: 'parlor', package: 'native' } as const;
