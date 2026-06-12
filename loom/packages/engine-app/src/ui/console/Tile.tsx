import { Box, Button, Card, Stack, Typography } from "@mui/material";
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
};

/**
 * One instance tile. DOM contract: .tile[data-id], child <img> (src only once
 * a thumb arrives), .live-badge/.staged-badge with a "show" class, .stagebtn
 * with exact text "stage"/"unstage", drag carries "text/loom-instance".
 */
export function Tile({ inst, isLive, isStaged, selected, solo, onSelect, onSolo }: Props) {
  const link = useEngine();
  const thumb = useThumb(inst.id);
  const badgeSx = {
    fontSize: 11,
    fontWeight: 700,
    borderRadius: "4px",
    px: 0.75,
    py: 0.25,
  } as const;
  return (
    <Card
      className="tile"
      data-id={inst.id}
      variant="outlined"
      draggable
      onClick={() => onSelect(inst.id)}
      onDoubleClick={() => onSolo(inst.id)}
      onDragStart={(e) => e.dataTransfer.setData("text/loom-instance", inst.id)}
      sx={{
        cursor: "pointer",
        bgcolor: "background.paper",
        borderColor: selected ? "primary.main" : "divider",
        gridColumn: solo ? "1 / -1" : undefined,
      }}
    >
      <Box
        component="img"
        alt=""
        src={thumb}
        sx={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", bgcolor: "#000" }}
      />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.75 }}>
        <Box
          component="span"
          className={`chip ${inst.status}`}
          title={inst.error ?? inst.status}
          sx={{ fontWeight: 700, color: inst.status === "ok" ? "primary.main" : "error.main" }}
        >
          {inst.status === "ok" ? "✓" : "✗"}
        </Box>
        <Typography className="name" variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {inst.id} · {inst.scene}
        </Typography>
        {inst.pinned === "panic" && (
          <Box
            component="span"
            className="badge panic-badge show"
            title="pinned PANIC safe-scene instance — always warm, can't be destroyed"
            sx={{ ...badgeSx, bgcolor: "info.main", color: "#000" }}
          >
            ⛑ PANIC
          </Box>
        )}
        <Box
          component="span"
          className={`badge live-badge${isLive ? " show" : ""}`}
          sx={{ ...badgeSx, bgcolor: "error.main", color: "#fff", display: isLive ? "inline" : "none" }}
        >
          LIVE
        </Box>
        <Box
          component="span"
          className={`badge staged-badge${isStaged ? " show" : ""}`}
          sx={{ ...badgeSx, bgcolor: "warning.main", color: "#000", display: isStaged ? "inline" : "none" }}
        >
          STAGED
        </Box>
        <Button
          className="stagebtn"
          disabled={isLive}
          onClick={(e) => {
            e.stopPropagation();
            void link
              .req(isStaged ? "unstage" : "stage", isStaged ? {} : { instance: inst.id })
              .catch(fail);
          }}
          sx={{ px: 1, py: 0.25, fontSize: 12 }}
        >
          {isStaged ? "unstage" : "stage"}
        </Button>
        <Button
          className="destroybtn"
          disabled={isLive || inst.pinned === "panic"}
          title="destroy"
          onClick={(e) => {
            e.stopPropagation();
            void link.req("destroy_instance", { instance: inst.id }).catch(fail);
          }}
          sx={{ px: 1, py: 0.25, fontSize: 12, minWidth: 0 }}
        >
          ×
        </Button>
      </Stack>
    </Card>
  );
}
