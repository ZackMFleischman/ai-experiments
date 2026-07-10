// The $1 store wrap (BRAND-IMPLEMENTATION.md 3b): identity here, conventions
// in the factory — shells live at sudoku/native/{ios,android}, webDir dist,
// splash on the app's paper. ⚑ appId is final only at first store upload;
// confirm before submitting.
// (the subpath import keeps the CLI's CJS config loader off the barrel file)
import { capacitorConfig } from '@parlor/native/capacitor-config';

export default capacitorConfig({
  appId: 'com.zmfapps.sudoku',
  appName: 'Sudoku',
  backgroundColor: '#f5f3ee',
});
