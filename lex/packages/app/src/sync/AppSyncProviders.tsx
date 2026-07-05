// Full-mode entry (T4.2): the lex side of the @parlor/web firebase wiring.
// This module lives in the lazy full-mode chunk only — importing it configures
// the firebase singleton for lex's projects (demo-lex on the emulators; the
// committed lex-zmf identifiers in production) before the provider mounts.
import AppSyncProviders from '@parlor/web/AppSyncProviders';
import { configureFirebase } from '@parlor/web/firebase';

configureFirebase({ emulatorProjectId: 'demo-lex' });

export default AppSyncProviders;
