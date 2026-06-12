import {
  Box, Button, Checkbox, FormControlLabel, Stack, Typography,
} from "@mui/material";
import { useState } from "react";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import { useEngine } from "../hooks";
import { fail } from "../util";

type Props = { session: SessionSnapshot };

/**
 * Slim stage bar: LIVE/STAGED pointers + unstage/arm/COMMIT, and the
 * drop-to-go-live target — dropping a tile here stages AND commits (R9.3
 * redesign; the human-sourced commit is never gated). DOM contract:
 * #stagestrip, #livename, #stagedname, #fadeinfo, #unstage, #commit, #armagent.
 */
export function StageStrip({ session: s }: Props) {
  const link = useEngine();
  const [dragOver, setDragOver] = useState(false);

  const withScene = (id: string | null) => {
    if (id == null) return "—";
    const sc = s.instances.find((i) => i.id === id)?.scene;
    return sc && sc !== id ? `${id} · ${sc}` : id;
  };

  return (
    <Stack
      id="stagestrip"
      direction="row"
      spacing={1.5}
      alignItems="center"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/loom-instance")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/loom-instance");
        // One gesture, all the way: drop = stage + commit.
        if (id) {
          void link
            .req("stage", { instance: id })
            .then(() => link.req("commit", {}))
            .catch(fail);
        }
      }}
      sx={{
        px: 1.25,
        py: 0.5,
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        flex: "0 0 auto",
        outline: dragOver ? "2px dashed" : "none",
        outlineColor: "warning.main",
        outlineOffset: "-2px",
      }}
    >
      <Typography variant="caption" color="text.secondary">LIVE ▸</Typography>
      <Typography id="livename" sx={{ fontWeight: 700, color: "error.main" }}>{withScene(s.live)}</Typography>
      <Typography variant="caption" color="text.secondary">STAGED ▸</Typography>
      <Typography id="stagedname" sx={{ fontWeight: 700, color: s.staged != null ? "warning.main" : "text.primary" }}>
        {withScene(s.staged)}
      </Typography>
      <Typography id="fadeinfo" variant="caption" color="text.secondary">
        {s.mix != null ? `crossfading ${(s.mix * 100).toFixed(0)}%` : ""}
      </Typography>
      {dragOver && (
        <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 700 }}>
          drop to go LIVE
        </Typography>
      )}
      <Box sx={{ flex: 1 }} />
      <FormControlLabel
        sx={{ mr: 0.5 }}
        control={
          <Checkbox
            size="small"
            id="armagent"
            checked={s.agentCommitArmed}
            onChange={(e) => void link.req("arm_agent_commit", { armed: e.target.checked }).catch(fail)}
          />
        }
        label={<Typography variant="caption" color="text.secondary">agent commit</Typography>}
      />
      <Button id="unstage" disabled={s.staged == null} onClick={() => void link.req("unstage").catch(fail)}>
        unstage
      </Button>
      <Button
        id="commit"
        color="primary"
        disabled={s.staged == null || s.panicked}
        onClick={() => void link.req("commit", {}).catch(fail)}
        sx={{ fontWeight: 700, fontSize: 14, px: 2 }}
      >
        COMMIT
      </Button>
    </Stack>
  );
}
