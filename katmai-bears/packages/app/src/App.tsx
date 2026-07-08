import { useEffect } from 'react';
import { installEventHandlers } from './app/wiring';
import { Alerts } from './components/Alerts';
import { BearapaloozaBanner } from './components/BearapaloozaBanner';
import { ClipsGallery } from './components/ClipsGallery';
import { Dashboard } from './components/Dashboard';
import { Fullscreen } from './components/Fullscreen';
import { Header } from './components/Header';
import { SettingsPanel } from './components/SettingsPanel';
import { createActiveSource } from './detection/createSource';
import { useClips } from './clips/store';
import { useDetection } from './state/detection';
import { useUi } from './state/ui';

export default function App() {
  const panel = useUi((s) => s.panel);
  const openFullscreen = useUi((s) => s.openFullscreen);

  useEffect(() => {
    // Honor a deep link (?stream=<id>&full=1) — e.g. a Bearapalooza notification tap.
    const params = new URLSearchParams(location.search);
    const stream = params.get('stream');
    if (stream && params.get('full') === '1') openFullscreen(stream);

    void useClips.getState().load();

    // Debug surface for e2e — drive a deterministic detection frame.
    window.__katmai = { ingest: useDetection.getState().ingest };

    const uninstall = installEventHandlers();
    const source = createActiveSource();
    const unsub = source.subscribe(useDetection.getState().ingest);
    source.start();

    return () => {
      unsub();
      source.stop();
      uninstall();
    };
  }, [openFullscreen]);

  return (
    <div className="app">
      <Header />
      <BearapaloozaBanner />
      <Dashboard />
      <Alerts />
      <Fullscreen />
      {panel === 'settings' ? <SettingsPanel /> : null}
      {panel === 'clips' ? <ClipsGallery /> : null}
    </div>
  );
}
