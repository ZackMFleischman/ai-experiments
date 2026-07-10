// Store metadata as a checked factory output (@parlor/native StoreListing —
// fastlane-compatible; validated by packages/app/test/store-listing.test.ts).
// Screenshots are a manifest-first promise: paths land here, files are
// produced from the visual-gallery captures / real devices at submission
// time. ⚑ URLs move to the real brand domain when Phase 5 replaces the
// placeholder support site.
import type { StoreListing } from '@parlor/native';

export const LISTING: StoreListing = {
  appId: 'com.zmfapps.sudoku',
  name: 'Sudoku',
  subtitle: 'A calm daily sudoku',
  description: [
    'A quiet, carefully made sudoku. One fresh daily puzzle, four',
    'difficulties, pencil notes, unlimited undo — and nothing else.',
    '',
    'No account. No ads. No analytics. No network at all: every puzzle is',
    'generated on your device and guaranteed to have exactly one solution.',
    'Play on a plane, in a tunnel, anywhere.',
    '',
    'Your streaks and best times stay on your device, because they are',
    'yours.',
    '',
    'Pay once. Own it. That is the whole business model.',
  ].join('\n'),
  keywords: ['sudoku', 'puzzle', 'daily', 'offline', 'logic', 'minimal', 'no ads'],
  categories: { primary: 'GAMES', secondary: 'ENTERTAINMENT' },
  priceUsd: 0.99,
  supportUrl: 'https://zmf-apps.pages.dev',
  privacy: {
    label: 'data-not-collected',
    policyUrl: 'https://zmf-apps.pages.dev/privacy.html',
  },
  screenshots: [
    { device: 'iphone-6.9', path: 'sudoku/store/screens/iphone-daily.png', caption: 'One fresh daily puzzle' },
    { device: 'iphone-6.9', path: 'sudoku/store/screens/iphone-notes.png', caption: 'Pencil notes, unlimited undo' },
    { device: 'iphone-6.9', path: 'sudoku/store/screens/iphone-dark.png', caption: 'Quiet in the dark, too' },
    { device: 'android-phone', path: 'sudoku/store/screens/android-daily.png', caption: 'One fresh daily puzzle' },
    { device: 'android-phone', path: 'sudoku/store/screens/android-notes.png', caption: 'Pencil notes, unlimited undo' },
    { device: 'play-feature-graphic', path: 'sudoku/store/screens/feature-graphic.png' },
  ],
};
