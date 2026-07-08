import { useState } from 'react';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { orderedStreams } from '../streams';
import { StreamTile } from './StreamTile';

export function Dashboard() {
  const hidden = useSettings((s) => s.hiddenStreams);
  const order = useSettings((s) => s.streamOrder);
  const setStreamOrder = useSettings((s) => s.setStreamOrder);
  const setPanel = useUi((s) => s.setPanel);

  // Local drag state — which tile is being dragged and which it's hovering over.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = orderedStreams(order);
  const visible = ordered.filter((s) => !hidden[s.id]);

  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  // Move the dragged tile to the target's slot, preserving hidden cams' relative positions
  // by reordering the full catalog list (not just the visible subset).
  const dropOn = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      const ids = ordered.map((s) => s.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from !== -1 && to !== -1) {
        const [moved] = ids.splice(from, 1);
        if (moved) ids.splice(to, 0, moved);
        setStreamOrder(ids);
      }
    }
    endDrag();
  };

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
        <div className={`wall${dragId ? ' wall--dragging' : ''}`}>
          {visible.map((s) => (
            <StreamTile
              key={s.id}
              stream={s}
              dragging={dragId !== null}
              isDragged={dragId === s.id}
              isOver={overId === s.id && dragId !== s.id}
              onDragStart={() => setDragId(s.id)}
              onDragOver={() => setOverId(s.id)}
              onDrop={() => dropOn(s.id)}
              onDragEnd={endDrag}
            />
          ))}
        </div>
      )}
    </main>
  );
}
