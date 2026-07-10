// capacitorConfig pins the shell conventions (strategy §1.0 tradeoff 4);
// validateStoreListing is the CI tripwire for metadata a store would bounce.
import { describe, expect, it } from 'vitest';
import { capacitorConfig, validateStoreListing, type StoreListing } from '../src/index.js';

describe('capacitorConfig', () => {
  it('pins the brand conventions from just the app identity', () => {
    const config = capacitorConfig({
      appId: 'com.example.sudoku',
      appName: 'Sudoku',
      backgroundColor: '#f5f3ee',
    });
    expect(config).toEqual({
      appId: 'com.example.sudoku',
      appName: 'Sudoku',
      webDir: 'dist',
      backgroundColor: '#f5f3ee',
      ios: { path: '../../native/ios', contentInset: 'automatic' },
      android: { path: '../../native/android' },
      server: { androidScheme: 'https' },
      plugins: {
        SplashScreen: {
          backgroundColor: '#f5f3ee',
          launchShowDuration: 500,
          launchAutoHide: true,
        },
      },
    });
  });

  it('lets an app relocate its dirs without unpinning conventions', () => {
    const config = capacitorConfig({
      appId: 'com.example.app',
      appName: 'App',
      backgroundColor: '#000000',
      webDir: 'build',
      nativeDir: './native',
    });
    expect(config.webDir).toBe('build');
    expect(config.ios.path).toBe('./native/ios');
    expect(config.android.path).toBe('./native/android');
    expect(config.server.androidScheme).toBe('https');
  });
});

function validListing(): StoreListing {
  return {
    appId: 'com.example.sudoku',
    name: 'Sudoku',
    subtitle: 'A calm daily puzzle',
    description: 'A quiet, offline sudoku with a fresh daily puzzle. No accounts, no ads.',
    keywords: ['sudoku', 'puzzle', 'daily', 'offline'],
    categories: { primary: 'GAMES' },
    priceUsd: 0.99,
    supportUrl: 'https://example.com/support',
    privacy: { label: 'data-not-collected', policyUrl: 'https://example.com/privacy' },
    screenshots: [
      { device: 'iphone-6.9', path: 'sudoku/store/screens/iphone-1.png' },
      { device: 'android-phone', path: 'sudoku/store/screens/android-1.png' },
      { device: 'play-feature-graphic', path: 'sudoku/store/screens/feature.png' },
    ],
  };
}

describe('validateStoreListing', () => {
  it('accepts a store-ready listing', () => {
    expect(validateStoreListing(validListing())).toEqual([]);
  });

  it('rejects each field a store would bounce', () => {
    expect(validateStoreListing({ ...validListing(), appId: 'Sudoku!' })).toContainEqual(
      expect.stringContaining('reverse-DNS'),
    );
    expect(validateStoreListing({ ...validListing(), name: 'x'.repeat(31) })).toContainEqual(
      expect.stringContaining('name'),
    );
    expect(validateStoreListing({ ...validListing(), subtitle: '' })).toContainEqual(
      expect.stringContaining('subtitle'),
    );
    expect(validateStoreListing({ ...validListing(), description: 'short' })).toContainEqual(
      expect.stringContaining('description'),
    );
    expect(
      validateStoreListing({ ...validListing(), keywords: ['k'.repeat(60), 'w'.repeat(60)] }),
    ).toContainEqual(expect.stringContaining('100'));
    expect(validateStoreListing({ ...validListing(), priceUsd: 0 })).toContainEqual(
      expect.stringContaining('paid up front'),
    );
    expect(
      validateStoreListing({ ...validListing(), supportUrl: 'http://insecure.example' }),
    ).toContainEqual(expect.stringContaining('supportUrl'));
    expect(
      validateStoreListing({
        ...validListing(),
        privacy: { label: 'data-not-collected', policyUrl: 'ftp://x' },
      }),
    ).toContainEqual(expect.stringContaining('policyUrl'));
  });

  it('demands the required screenshot classes and unique paths', () => {
    const missing = { ...validListing(), screenshots: validListing().screenshots.slice(0, 1) };
    const errors = validateStoreListing(missing);
    expect(errors).toContainEqual(expect.stringContaining("'android-phone'"));
    expect(errors).toContainEqual(expect.stringContaining("'play-feature-graphic'"));

    const dup = validListing();
    dup.screenshots.push({ device: 'iphone-6.9', path: 'sudoku/store/screens/iphone-1.png' });
    expect(validateStoreListing(dup)).toContainEqual(expect.stringContaining('duplicate'));
  });
});
