// Store metadata as a checked factory output (@parlor/native StoreListing —
// fastlane-compatible; validated by packages/app/test/store-listing.test.ts).
// Screenshots are a manifest-first promise: paths land here, files are
// produced from the visual-gallery captures / real devices at submission
// time. The store name is "Bricks" — Breakout is Atari's trademark; the
// directory keeps the archetype's working name. ⚑ URLs move to the real
// brand domain when Phase 5's site gets one.
import type { StoreListing } from '@parlor/native';

export const LISTING: StoreListing = {
  appId: 'com.zmfapps.bricks',
  name: 'Bricks',
  subtitle: 'The wall, the paddle, the ball',
  description: [
    'A quiet, carefully made brick-breaker. One paddle, one ball, a wall',
    'that fights back a little harder every level — and nothing else.',
    '',
    'No account. No ads. No analytics. No network at all: the whole game',
    'runs on your device, offline, forever. Play on a plane, in a tunnel,',
    'anywhere.',
    '',
    'Your best runs stay on your device, because they are yours.',
    '',
    'Pay once. Own it. That is the whole business model.',
  ].join('\n'),
  keywords: ['bricks', 'breakout', 'arcade', 'paddle', 'offline', 'minimal', 'no ads'],
  categories: { primary: 'GAMES', secondary: 'ENTERTAINMENT' },
  priceUsd: 0.99,
  supportUrl: 'https://zmf-apps.pages.dev',
  privacy: {
    label: 'data-not-collected',
    policyUrl: 'https://zmf-apps.pages.dev/privacy.html',
  },
  screenshots: [
    { device: 'iphone-6.9', path: 'breakout/store/screens/iphone-serving.png', caption: 'The wall, the paddle, the ball' },
    { device: 'iphone-6.9', path: 'breakout/store/screens/iphone-mid.png', caption: 'A little harder every level' },
    { device: 'iphone-6.9', path: 'breakout/store/screens/iphone-dark.png', caption: 'Quiet in the dark, too' },
    { device: 'android-phone', path: 'breakout/store/screens/android-serving.png', caption: 'The wall, the paddle, the ball' },
    { device: 'android-phone', path: 'breakout/store/screens/android-mid.png', caption: 'A little harder every level' },
    { device: 'play-feature-graphic', path: 'breakout/store/screens/feature-graphic.png' },
  ],
};
