// Full-mode entry: the tafl side of the @parlor/web firebase wiring. This
// module lives in the lazy full-mode chunk only — importing it configures
// the firebase singleton for tafl's projects (demo-tafl on the emulators;
// the committed tafl-zmf identifiers in production) before the provider
// mounts.
import AppSyncProviders from '@parlor/web/AppSyncProviders';
import { configureFirebase } from '@parlor/web/firebase';

configureFirebase({ emulatorProjectId: 'demo-tafl' });

export default AppSyncProviders;
