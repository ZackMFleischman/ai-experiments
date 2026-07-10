// The one place Capacitor conventions are pinned (strategy §1.0 tradeoff 4):
// every app's capacitor.config.ts is a one-liner over this factory, so when
// a Capacitor major lands, the shell upgrade is a change here plus a
// mechanical `cap sync` per app — never N hand-drifted configs. The return
// type is a structural subset of @capacitor/cli's CapacitorConfig (typed
// locally so this package imports nothing).

export interface BrandCapacitorApp {
  /** Reverse-DNS store identity, e.g. 'com.zmfapps.sudoku'. */
  appId: string;
  /** Display name under the icon; keep it to one word where possible. */
  appName: string;
  /** Splash + WebView background — the app's paper color, so the moment
   * between splash and first paint is invisible. */
  backgroundColor: string;
  /** Vite output relative to the app package (the config's directory). */
  webDir?: string;
  /** Where the committed shells live, relative to the app package.
   * Convention: APP/native/{ios,android} (BRAND-IMPLEMENTATION.md 3b). */
  nativeDir?: string;
}

export interface BrandCapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  backgroundColor: string;
  ios: { path: string; contentInset: 'automatic' };
  android: { path: string };
  server: { androidScheme: 'https' };
  plugins: {
    SplashScreen: {
      backgroundColor: string;
      launchShowDuration: number;
      launchAutoHide: boolean;
    };
  };
}

export function capacitorConfig(app: BrandCapacitorApp): BrandCapacitorConfig {
  const { appId, appName, backgroundColor, webDir = 'dist', nativeDir = '../../native' } = app;
  return {
    appId,
    appName,
    webDir,
    backgroundColor,
    ios: { path: `${nativeDir}/ios`, contentInset: 'automatic' },
    android: { path: `${nativeDir}/android` },
    // Capacitor 8's default, pinned so a future default flip can't silently
    // change deep-link origins (https://localhost) under shipped apps.
    server: { androidScheme: 'https' },
    plugins: {
      SplashScreen: {
        backgroundColor,
        // Long enough to cover WebView boot on a cold start, short enough
        // that the "real launch screen" (Apple 4.2 defense) never lingers.
        launchShowDuration: 500,
        launchAutoHide: true,
      },
    },
  };
}
