import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { STREAMS } from '../streams';
import { StreamTile } from './StreamTile';

export function Dashboard() {
  const hidden = useSettings((s) => s.hiddenStreams);
  const setPanel = useUi((s) => s.setPanel);
  const visible = STREAMS.filter((s) => !hidden[s.id]);

  return (
    <main className="dashboard">
      {visible.length === 0 ? (
        <div className="empty">
          <p>All streams are hidden.</p>
          <button className="btn" onClick={() => setPanel('settings')}>
            Turn some back on in Settings
          </button>
        </div>
      ) : (
        <div className="grid">
          {visible.map((s) => (
            <StreamTile key={s.id} stream={s} />
          ))}
        </div>
      )}
    </main>
  );
}
