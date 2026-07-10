// The $1 store wrap (BRAND-IMPLEMENTATION.md 3c): identity here, conventions
// in the factory — shells live at stillness/native/{ios,android}. ⚑ appId is
// final only at first store upload; confirm before submitting.
// (the subpath import keeps the CLI's CJS config loader off the barrel)
import { capacitorConfig } from '@parlor/native/capacitor-config';

export default capacitorConfig({
  appId: 'com.zmfapps.stillness',
  appName: 'Stillness',
  backgroundColor: '#f5f3ee',
});
