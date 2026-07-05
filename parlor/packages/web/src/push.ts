// ported from hive/packages/app/src/sync/push.ts (adapted)
// FCM token capture: on grant, the token lands in users/{uid}.fcmTokens[]
// (multi-device; the only client-writable doc). Stale tokens are pruned
// server-side on send failure (@parlor/server sendPush).
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { getApp, getDb, usingEmulators } from './firebase';

const env: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export async function messagingSupported(): Promise<boolean> {
  if (usingEmulators()) return false; // FCM has no emulator
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/** Fetch (or refresh) this device's token and store it on the user doc. */
export async function ensureFcmToken(uid: string): Promise<void> {
  const registration = await navigator.serviceWorker?.ready;
  const token = await getToken(getMessaging(getApp()), {
    ...(env.VITE_FIREBASE_VAPID_KEY ? { vapidKey: env.VITE_FIREBASE_VAPID_KEY } : {}),
    ...(registration ? { serviceWorkerRegistration: registration } : {}),
  });
  if (!token) return;
  await setDoc(doc(getDb(), 'users', uid), { fcmTokens: arrayUnion(token) }, { merge: true });
}
