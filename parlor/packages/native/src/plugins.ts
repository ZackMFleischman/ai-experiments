// Typed wrappers over the bridge plugins every brand app ships (strategy
// §1.1): haptics / share / status-bar / in-app-review, plus the utility trio
// — local-notifications / background-audio / keep-awake — that the meditation
// timer exists to exercise. Every wrapper no-ops cleanly in a plain browser
// (callPlugin's contract), so wiring one into an app never changes the free
// PWA's behavior. Method names and option shapes mirror the official plugin
// APIs 1:1 — the native side IS the official plugin, reached via the bridge.
import { callPlugin, nativePlatform } from './bridge.js';

// ---- haptics (@capacitor/haptics) ----------------------------------------

export type HapticImpactStyle = 'light' | 'medium' | 'heavy';
export type HapticNotificationType = 'success' | 'warning' | 'error';

export async function hapticImpact(style: HapticImpactStyle = 'light'): Promise<void> {
  await callPlugin('Haptics', 'impact', { style: style.toUpperCase() });
}

export async function hapticNotification(type: HapticNotificationType): Promise<void> {
  await callPlugin('Haptics', 'notification', { type: type.toUpperCase() });
}

export async function hapticSelection(): Promise<void> {
  await callPlugin('Haptics', 'selectionChanged');
}

// ---- share (@capacitor/share) ---------------------------------------------

export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
}

/** True when the native share sheet actually opened; false in a plain
 * browser and when the user dismissed the sheet (Share.share rejects). */
export async function shareContent(content: ShareContent): Promise<boolean> {
  const result = await callPlugin<{ activityType?: string }>('Share', 'share', content);
  return result !== null;
}

// ---- status bar (@capacitor/status-bar) -----------------------------------

/** Keep the status bar readable when the app's color mode flips. `style` is
 * the *bar background* the content sits on: dark mode wants light glyphs.
 * setBackgroundColor is Android-only, so it's platform-gated, not try/caught. */
export async function syncStatusBar(mode: 'light' | 'dark', backgroundColor?: string): Promise<void> {
  await callPlugin('StatusBar', 'setStyle', { style: mode === 'dark' ? 'DARK' : 'LIGHT' });
  if (backgroundColor && nativePlatform() === 'android') {
    await callPlugin('StatusBar', 'setBackgroundColor', { color: backgroundColor });
  }
}

// ---- in-app review (@capacitor-community/in-app-review) --------------------

/** Ask the OS for the rating prompt. Both stores throttle it and give no
 * signal whether it showed — treat this as fire-and-forget, never gate UI
 * on it. */
export async function requestReview(): Promise<void> {
  await callPlugin('InAppReview', 'requestReview');
}

// ---- local notifications (@capacitor/local-notifications) ------------------

export async function requestNotificationPermission(): Promise<boolean> {
  const result = await callPlugin<{ display?: string }>('LocalNotifications', 'requestPermissions');
  return result?.display === 'granted';
}

export interface LocalNotification {
  id: number;
  title: string;
  body: string;
  at: Date;
}

export async function scheduleNotification(notification: LocalNotification): Promise<boolean> {
  const { id, title, body, at } = notification;
  const result = await callPlugin('LocalNotifications', 'schedule', {
    notifications: [{ id, title, body, schedule: { at } }],
  });
  return result !== null;
}

export async function cancelNotification(id: number): Promise<void> {
  await callPlugin('LocalNotifications', 'cancel', { notifications: [{ id }] });
}

// ---- keep awake (@capacitor-community/keep-awake) ---------------------------

export async function keepAwake(): Promise<void> {
  await callPlugin('KeepAwake', 'keepAwake');
}

export async function allowSleep(): Promise<void> {
  await callPlugin('KeepAwake', 'allowSleep');
}

// ---- background audio ------------------------------------------------------
// No official @capacitor plugin exists; the contract is fixed here so app
// code is stable, and the native implementation (a community plugin or a thin
// custom one registered as 'BackgroundAudio') lands with stillness/ (Phase
// 3c), the app that exists to exercise it. On web this no-ops — a web app
// that wants audio uses <audio> directly and accepts tab-lifecycle limits.

export interface BackgroundAudioSource {
  /** Asset path or URL the native player can reach. */
  src: string;
  loop?: boolean;
  volume?: number;
}

export async function startBackgroundAudio(source: BackgroundAudioSource): Promise<boolean> {
  return (await callPlugin('BackgroundAudio', 'play', source)) !== null;
}

export async function stopBackgroundAudio(): Promise<void> {
  await callPlugin('BackgroundAudio', 'stop');
}
