// @parlor/native talks to Capacitor exclusively through the runtime bridge
// the native shell injects (globalThis.Capacitor) — never by importing
// @capacitor/* JS. Two things fall out of that: the free web PWA bundle is
// byte-identical whether or not this package exists (the discipline
// BRAND-IMPLEMENTATION.md Phase 3a demands), and unit tests mock the bridge
// object instead of the packages. The @capacitor/* packages are still
// (optional) peers: the consuming app installs them so `cap sync` compiles
// their native code into the shells the bridge then exposes.

/** The slice of the injected Capacitor global this package relies on.
 * Native plugins auto-register on the bridge, so their methods are reachable
 * via `Plugins` without importing the JS wrappers. */
export interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, Record<string, (options?: unknown) => unknown> | undefined>;
}

export function getBridge(): CapacitorBridge | undefined {
  return (globalThis as { Capacitor?: CapacitorBridge }).Capacitor;
}

/** True only inside a Capacitor shell — plain browsers (and jsdom) get false. */
export function isNative(): boolean {
  try {
    return getBridge()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function nativePlatform(): 'ios' | 'android' | null {
  if (!isNative()) return null;
  try {
    const platform = getBridge()?.getPlatform?.();
    return platform === 'ios' || platform === 'android' ? platform : null;
  } catch {
    return null;
  }
}

/** Call a bridge plugin method, or no-op. Never throws, never rejects —
 * a missing plugin, a plain browser, or a native failure all resolve null;
 * no wrapper may ever interrupt play (the solo kit's storage discipline). */
export async function callPlugin<Result>(
  plugin: string,
  method: string,
  options?: unknown,
): Promise<Result | null> {
  if (!isNative()) return null;
  try {
    const fn = getBridge()?.Plugins?.[plugin]?.[method];
    if (typeof fn !== 'function') return null;
    return ((await fn(options)) ?? null) as Result | null;
  } catch {
    return null;
  }
}
