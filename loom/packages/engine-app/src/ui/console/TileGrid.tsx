import { Box } from "@mui/material";
import { useRef, useState } from "react";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import { NewInstanceTile } from "./NewInstanceTile";
import { Tile } from "./Tile";

type Props = {
  session: SessionSnapshot;
  selected: string | null;
  solo: string | null;
  onSelect: (id: string) => void;
  onSolo: (id: string) => void;
  onCreated: (id: string) => void;
};

const ORDER_KEY = "loom.tileorder";

const loadOrder = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

/**
 * The instance grid. Tiles drag-reorder (order persists locally; unknown ids
 * keep engine order at the end) — the same drag, released on the stage bar,
 * goes live. DOM contract: #grid, tiles render in display order.
 */
export function TileGrid({ session: s, selected, solo, onSelect, onSolo, onCreated }: Props) {
  const [order, setOrder] = useState<string[]>(loadOrder);
  // The "+" tile's preview instances render inside that tile, never as grid
  // tiles. Hiding must outlive the preview pointer: a destroyed preview stays
  // in the session for a state tick or two, and clearing its id immediately
  // made the dying tile flash in (shifting the whole grid — the flicker).
  // Spawned ids stay hidden until they leave the session; picking adopts one.
  // id → "seen in a session snapshot yet". Hidden ids are added at
  // create-response time, often BEFORE the 10 Hz snapshot includes them —
  // prune only after seen-then-gone, or fresh ids get unhidden by the race.
  const hiddenPreviews = useRef<Map<string, boolean>>(new Map());
  const [, bump] = useState(0);
  const hidePreview = (id: string) => {
    hiddenPreviews.current.set(id, false);
    bump((n) => n + 1);
  };
  const adoptPreview = (id: string) => {
    hiddenPreviews.current.delete(id);
    bump((n) => n + 1);
  };
  const dragId = useRef<string | null>(null);

  for (const [id, seen] of hiddenPreviews.current) {
    const inSession = s.instances.some((i) => i.id === id);
    if (inSession) {
      if (!seen) hiddenPreviews.current.set(id, true);
    } else if (seen) {
      hiddenPreviews.current.delete(id); // gone for good — ids never repeat
    }
  }

  const pos = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  const sorted = [...s.instances]
    .filter((i) => !hiddenPreviews.current.has(i.id))
    .sort((a, b) => pos(a.id) - pos(b.id));

  const reorderOver = (overId: string) => {
    const from = dragId.current;
    if (from == null || from === overId) return;
    const cur = sorted.map((i) => i.id);
    if (cur.indexOf(from) === cur.indexOf(overId) - 1) return; // already just before it
    const next = cur.filter((id) => id !== from);
    next.splice(next.indexOf(overId), 0, from);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {
      // order just won't persist across reloads
    }
    setOrder(next);
  };

  return (
    <Box
      id="grid"
      sx={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 1,
        p: 1,
        alignContent: "start",
        overflowY: "auto",
      }}
    >
      {sorted.map((inst) => (
        <Tile
          key={inst.id}
          inst={inst}
          isLive={inst.id === s.live}
          isStaged={inst.id === s.staged}
          selected={inst.id === selected}
          solo={inst.id === solo}
          onSelect={onSelect}
          onSolo={onSolo}
          onDragId={(id) => (dragId.current = id)}
          onReorderOver={reorderOver}
        />
      ))}
      <NewInstanceTile
        scenes={s.availableScenes}
        onCreated={onCreated}
        onPreviewSpawn={hidePreview}
        onPreviewAdopt={adoptPreview}
      />
    </Box>
  );
}
