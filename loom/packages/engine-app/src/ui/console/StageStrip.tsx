import {
  Box, Button, Checkbox, FormControlLabel, NativeSelect, Stack, Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import { useEngine } from "../hooks";
import { fail } from "../util";

type Props = { session: SessionSnapshot; onCreated: (id: string) => void };

/**
 * Scene picker + LIVE/STAGED pointers + unstage/arm/COMMIT, and the
 * drag-to-stage drop target (R9.3). DOM contract: #stagestrip, #scenepick
 * (native select), #createbtn, #unstage, #commit, #armagent.
 */
export function StageStrip({ session: s, onCreated }: Props) {
  const link = useEngine();
  const [dragOver, setDragOver] = useState(false);
  const [scene, setScene] = useState("");
  const scenes = s.availableScenes;

  // Keep the user's pick across library refreshes; default to the first scene.
  useEffect(() => {
    if (!scenes.includes(scene)) setScene(scenes[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.join(",")]);

  const withScene = (id: string | null) => {
    if (id == null) return "—";
    const sc = s.instances.find((i) => i.id === id)?.scene;
    return sc && sc !== id ? `${id} · ${sc}` : id;
  };

  return (
    <Stack
      id="stagestrip"
      direction="row"
      spacing={2}
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
        if (id) void link.req("stage", { instance: id }).catch(fail);
      }}
      sx={{
        px: 1.75,
        py: 1,
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        flex: "0 0 auto",
        outline: dragOver ? "2px dashed" : "none",
        outlineColor: "warning.main",
        outlineOffset: "-2px",
      }}
    >
      <NativeSelect value={scene} inputProps={{ id: "scenepick" }} onChange={(e) => setScene(e.target.value)}>
        {scenes.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </NativeSelect>
      <Button
        id="createbtn"
        onClick={() => {
          if (!scene) return;
          void link
            .req("create_instance", { scene })
            .then((r) => onCreated((r as { instance: string }).instance))
            .catch(fail);
        }}
      >
        + instance
      </Button>
      <Typography variant="caption" color="text.secondary">LIVE</Typography>
      <Typography id="livename" sx={{ fontWeight: 700 }}>{withScene(s.live)}</Typography>
      <Typography variant="caption" color="text.secondary">STAGED</Typography>
      <Typography id="stagedname" sx={{ fontWeight: 700 }}>{withScene(s.staged)}</Typography>
      <Button id="unstage" disabled={s.staged == null} onClick={() => void link.req("unstage").catch(fail)}>
        unstage
      </Button>
      <Typography id="fadeinfo" variant="caption" color="text.secondary">
        {s.mix != null ? `crossfading ${(s.mix * 100).toFixed(0)}%` : ""}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <FormControlLabel
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
      <Button
        id="commit"
        color="primary"
        disabled={s.staged == null || s.panicked}
        onClick={() => void link.req("commit", {}).catch(fail)}
        sx={{ fontWeight: 700, fontSize: 15, px: 2.5 }}
      >
        COMMIT
      </Button>
    </Stack>
  );
}
