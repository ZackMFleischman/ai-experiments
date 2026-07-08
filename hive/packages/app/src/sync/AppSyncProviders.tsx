// Full-mode provider stack — now @parlor/web's, configured for hive. Loaded
// lazily by App.tsx when VITE_HIVE_MODE=full; the only chunk that touches the
// firebase SDK. configureFirebase runs at import time (before any @parlor/web
// firebase getter) to point the shared singleton at hive's emulator project.
import { configureFirebase } from '@parlor/web/firebase';

configureFirebase({ emulatorProjectId: 'demo-hive' });

export { default } from '@parlor/web/AppSyncProviders';
