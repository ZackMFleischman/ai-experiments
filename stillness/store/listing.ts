// Store metadata as a checked factory output (@parlor/native StoreListing —
// fastlane-compatible; validated by packages/app/test/store-listing.test.ts).
// Screenshots are a manifest-first promise: paths land here, files are
// produced from the visual-gallery captures / real devices at submission
// time. ⚑ URLs move to the real brand domain when Phase 5 replaces the
// placeholder support site.
import type { StoreListing } from '@parlor/native';

export const LISTING: StoreListing = {
  appId: 'com.zmfapps.stillness',
  name: 'Stillness',
  subtitle: 'A quiet meditation timer',
  description: [
    'A meditation timer with nothing in it. Choose a length, sit, and a',
    'soft bell ends the sit — even if the screen locked.',
    '',
    'No account. No ads. No analytics. No courses, no guilt streaks, no',
    'subscription upsell. No network at all: your sits and day streak stay',
    'on your device, because they are yours.',
    '',
    'The screen stays awake while you sit. The bell still rings from a',
    'locked phone. That is the entire feature list, on purpose.',
    '',
    'Pay once. Own it. That is the whole business model.',
  ].join('\n'),
  keywords: ['meditation', 'timer', 'mindfulness', 'zen', 'quiet', 'offline', 'minimal'],
  categories: { primary: 'HEALTH_AND_FITNESS', secondary: 'LIFESTYLE' },
  priceUsd: 0.99,
  supportUrl: 'https://zmf-apps.pages.dev',
  privacy: {
    label: 'data-not-collected',
    policyUrl: 'https://zmf-apps.pages.dev/privacy.html',
  },
  screenshots: [
    { device: 'iphone-6.9', path: 'stillness/store/screens/iphone-home.png', caption: 'Choose a length. Sit.' },
    { device: 'iphone-6.9', path: 'stillness/store/screens/iphone-sit.png', caption: 'A ring, a clock, a bell' },
    { device: 'iphone-6.9', path: 'stillness/store/screens/iphone-dark.png', caption: 'Quiet in the dark, too' },
    { device: 'android-phone', path: 'stillness/store/screens/android-home.png', caption: 'Choose a length. Sit.' },
    { device: 'android-phone', path: 'stillness/store/screens/android-sit.png', caption: 'A ring, a clock, a bell' },
    { device: 'play-feature-graphic', path: 'stillness/store/screens/feature-graphic.png' },
  ],
};
