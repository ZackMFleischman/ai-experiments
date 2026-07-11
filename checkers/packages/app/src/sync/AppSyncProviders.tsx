// stamped-from tafl/packages/app/src/sync/AppSyncProviders.tsx@e3186bcc76c4b21a0f557e36c7801a00943ce3e2 — regenerate, don't hand-sync (lint: registry/check-stamps.mjs)
// Full-mode entry: the checkers side of the @parlor/web firebase wiring. This
// module lives in the lazy full-mode chunk only — importing it configures
// the firebase singleton for checkers's projects (demo-checkers on the emulators;
// the committed checkers-zmf identifiers in production) before the provider
// mounts.
import AppSyncProviders from '@parlor/web/AppSyncProviders';
import { configureFirebase } from '@parlor/web/firebase';

configureFirebase({ emulatorProjectId: 'demo-checkers' });

export default AppSyncProviders;
