import { Box, Button, Card, IconButton, Stack, Typography } from "@mui/material";
import type { InstanceInfo } from "@loom/sidecar/protocol";
import { useEngine, useThumb } from "../hooks";
import { fail } from "../util";

type Props = {
  inst: InstanceInfo;
  isLive: boolean;
  isStaged: boolean;
  selected: boolean;
  solo: boolean;
  onSelect: (id: string) => void;
  onSolo: (id: string) => void;
  /** Grid-level drag bookkeeping: which tile is being dragged (null on end). */
  onDragId: (id: string | null) => void;
  /** Reorder the dragged tile before this one (fires on drag-over). */
  onReorderOver: (overId: string) => void;
};

const badgeSx = {
  position: "absolute",
  top: 6,
  fontSize: 10,
  fontWeight: 700,
  borderRadius: "3px",
  px: 0.6,
  py: 0.2,
  lineHeight: 1.4,
} as const;

/**
 * One instance tile. DOM contract: .tile[data-id], child <img> (src only once
 * a thumb arrives), .live-badge/.staged-badge with a "show" class, .stagebtn
 * with exact text "stage"/"unstage", drag carries "text/loom-instance".
 * Chrome lives on the thumbnail: LIVE ring + chip, hover-only destroy ×.
 */
export function Tile({
  inst, isLive, isStaged, selected, solo, onSelect, onSolo, onDragId, onReorderOver,
}: Props) {
  const link = useEngine();
  const thumb = useThumb(inst.id);
  const ring = isLive ? "error.main" : isStaged ? "warning.main" : selected ? "primary.main" : null;
  return (
    <Card
      className="tile"
      data-id={inst.id}
      variant="outlined"
      draggable
      onClick={() => onSelect(inst.id)}
      onDoubleClick={() => onSolo(inst.id)}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/loom-instance", inst.id);
        e.dataTransfer.effectAllowed = "move";
        onDragId(inst.id);
      }}
      onDragEnd={() => onDragId(null)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/loom-instance")) return;
        e.preventDefault();
        onReorderOver(inst.id);
      }}
      sx={{
        position: "relative",
        cursor: "grab",
        bgcolor: "background.paper",
        borderColor: ring ?? "divider",
        boxShadow: ring ? "0 0 0 1.5px" : "none",
        color: ring ?? undefined, // boxShadow picks up currentColor for the ring
        gridColumn: solo ? "1 / -1" : undefined,
        "&:hover .destroybtn": { opacity: 1, pointerEvents: "auto" },
      }}
    >
      <Box
        component="img"
        alt=""
        src={thumb}
        sx={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", bgcolor: "#000" }}
      />
      <Box
        component="span"
        className={`badge live-badge${isLive ? " show" : ""}`}
        sx={{ ...badgeSx, left: 6, bgcolor: "error.main", color: "#fff", display: isLive ? "inline-block" : "none" }}
      >
        LIVE
      </Box>
      <Box
        component="span"
        className={`badge staged-badge${isStaged ? " show" : ""}`}
        sx={{ ...badgeSx, left: isLive ? 44 : 6, bgcolor: "warning.main", color: "#000", display: isStaged ? "inline-block" : "none" }}
      >
        STAGED
      </Box>
      {!isLive && (
        <IconButton
          className="destroybtn"
          title="destroy"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            void link.req("destroy_instance", { instance: inst.id }).catch(fail);
          }}
          sx={{
            position: "absolute",
            top: 2,
            right: 2,
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 120ms",
            color: "#fff",
            bgcolor: "#000a",
            fontSize: 14,
            width: 22,
            height: 22,
            "&:hover": { bgcolor: "error.main" },
          }}
        >
          ×
        </IconButton>
      )}
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 1, py: 0.5, color: "text.primary" }}>
        <Box
          component="span"
          className={`chip ${inst.status}`}
          title={inst.error ?? inst.status}
          sx={{ fontWeight: 700, fontSize: 11, color: inst.status === "ok" ? "primary.main" : "error.main" }}
        >
          {inst.status === "ok" ? "✓" : "✗"}
        </Box>
        <Typography className="name" variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {inst.id} · {inst.scene}
        </Typography>
        <Button
          className="stagebtn"
          disabled={isLive}
          onClick={(e) => {
            e.stopPropagation();
            void link
              .req(isStaged ? "unstage" : "stage", isStaged ? {} : { instance: inst.id })
              .catch(fail);
          }}
          sx={{ px: 0.75, py: 0, fontSize: 11 }}
        >
          {isStaged ? "unstage" : "stage"}
        </Button>
      </Stack>
    </Card>
  );
}
