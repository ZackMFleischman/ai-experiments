// The $1 store wrap (BRAND-IMPLEMENTATION.md 4a → GAME-SETUP.md §12):
// identity here, conventions in the factory — shells live at
// breakout/native/{ios,android}, webDir dist, splash on the app's paper.
// ⚑ appId is final only at first store upload; confirm before submitting.
// (the subpath import keeps the CLI's CJS config loader off the barrel file)
import { capacitorConfig } from '@parlor/native/capacitor-config';

export default capacitorConfig({
  appId: 'com.zmfapps.bricks',
  appName: 'Bricks',
  backgroundColor: '#f5f3ee',
});
