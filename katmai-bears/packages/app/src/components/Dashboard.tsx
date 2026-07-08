import { useCallback, useRef, useState } from 'react';
import { useWallLayout } from '../hooks/useWallLayout';
import { TILE_SPAN, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { orderedStreams } from '../streams';
import { StreamTile } from './StreamTile';

export function Dashboard() {
  const hidden = useSettings((s) => s.hiddenStreams);
  const order = useSettings((s) => s.streamOrder);
  const tileSizes = useSettings((s) => s.tileSizes);
  const setStreamOrder = useSettings((s) => s.setStreamOrder);
  const setPanel = useUi((s) => s.setPanel);

  const dashRef = useRef<HTMLElement | null>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const rects = useRef<Array<{ id: string; rect: DOMRect }>>([]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = orderedStreams(order);
  const visible = ordered.filter((s) => !hidden[s.id]);
  const spans = visible.map((s) => TILE_SPAN[tileSizes[s.id] ?? 'sm']);
  const layout = useWallLayout(dashRef, spans);

  const registerTile = useCallback((id: string, el: HTMLElement | null) => {
    if (el) tileRefs.current.set(id, el);
    else tileRefs.current.delete(id);
  }, []);

  // Pointer-based reorder: robust across the YouTube iframes (which swallow HTML5 drag
  // events). The grip captures the pointer, so we get every move regardless of what's
  // underneath, and we hit-test against the tiles' frozen rects to find the drop target.
  const beginDrag = useCallback(
    (id: string) => {
      rects.current = visible
        .map((s) => {
          const el = tileRefs.current.get(s.id);
          return el ? { id: s.id, rect: el.getBoundingClientRect() } : null;
        })
        .filter((r): r is { id: string; rect: DOMRect } => r !== null);
      setDragId(id);
      setOverId(id);
    },
    [visible],
  );

  const moveDrag = useCallback((x: number, y: number) => {
    const hit = rects.current.find(
      (r) => x >= r.rect.left && x <= r.rect.right && y >= r.rect.top && y <= r.rect.bottom,
    );
    setOverId(hit ? hit.id : null);
  }, []);

  const endDrag = useCallback(() => {
    setDragId((from) => {
      setOverId((to) => {
        if (from && to && from !== to) {
          const ids = ordered.map((s) => s.id);
          const fromIdx = ids.indexOf(from);
          const toIdx = ids.indexOf(to);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [moved] = ids.splice(fromIdx, 1);
            if (moved) ids.splice(toIdx, 0, moved);
            setStreamOrder(ids);
          }
        }
        return null;
      });
      return null;
    });
  }, [ordered, setStreamOrder]);

  return (
    <main className="dashboard" ref={dashRef}>
      {visible.length === 0 ? (
        <div className="empty">
          <p>All streams are hidden.</p>
          <button className="btn" onClick={() => setPanel('settings')}>
            Turn some back on in Settings
          </button>
        </div>
      ) : (
        <div
          className={`wall${dragId ? ' wall--dragging' : ''}`}
          data-mode={layout.mode}
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, ${layout.unitW}px)`,
            gridAutoRows: `${layout.unitH}px`,
          }}
        >
          {visible.map((s) => (
            <StreamTile
              key={s.id}
              stream={s}
              span={TILE_SPAN[tileSizes[s.id] ?? 'sm']}
              registerRef={registerTile}
              isDragged={dragId === s.id}
              isOver={overId === s.id && dragId !== s.id}
              onGripDown={() => beginDrag(s.id)}
              onGripMove={moveDrag}
              onGripUp={endDrag}
            />
          ))}
        </div>
      )}
    </main>
  );
}
