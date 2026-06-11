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
  const dragId = useRef<string | null>(null);

  const pos = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  const sorted = [...s.instances].sort((a, b) => pos(a.id) - pos(b.id));

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
      <NewInstanceTile scenes={s.availableScenes} onCreated={onCreated} />
    </Box>
  );
}
