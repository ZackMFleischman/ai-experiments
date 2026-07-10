// Decision A2 (MINIMALIST-APPS-STRATEGY.md): the native app is $1 paid up
// front and the web PWA is free — so "premium" is a fact about the platform,
// not an entitlement to check. Zero billing code, zero receipts. Apps still
// branch through this seam (never through isNative directly) so that if paid
// conversion ever proves terrible, the RevenueCat fallback replaces this one
// body and no call site moves.
import { isNative } from './bridge.js';

/** Hook-shaped on purpose (usable in components today, swappable for a real
 * subscription hook later) but deliberately just a function — it reads no
 * React state and needs no provider. */
export function usePremium(): boolean {
  return isNative();
}
