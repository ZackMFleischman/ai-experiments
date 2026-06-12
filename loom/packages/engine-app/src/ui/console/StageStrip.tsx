import {
  Box, Button, Checkbox, FormControlLabel, Stack, Typography,
} from "@mui/material";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import { useEngine } from "../hooks";
import { fail } from "../util";

type Props = { session: SessionSnapshot };

/**
 * Slim stage bar: LIVE/STAGED pointers + unstage/arm/COMMIT. The
 * drop-to-go-live target lives in StageDropZone (the whole console top);
 * drag events on this row bubble up to it. DOM contract: #stagestrip,
 * #livename, #stagedname, #fadeinfo, #unstage, #commit, #armagent.
 */
export function StageStrip({ session: s }: Props) {
  const link = useEngine();

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
      sx={{
        px: 1.25,
        py: 0.5,
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        flex: "0 0 auto",
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
      <ActionChip s={s} path="live.prev" label="◀ live" />
      <ActionChip s={s} path="live.next" label="live ▶" />
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

/** MIDI-learn chip for a stage action (live.prev / live.next): press a
 * controller button to step LIVE through the ok tiles. Same visual contract
 * as ParamWidget's learn button (data-learn, M/···/ccN). */
function ActionChip({ s, path, label }: { s: SessionSnapshot; path: "live.prev" | "live.next"; label: string }) {
  const link = useEngine();
  const binding = s.bindings.find((b) => b.scene === "actions" && b.path === path) ?? null;
  const learning =
    s.midi.learning != null && s.midi.learning.scene === "actions" && s.midi.learning.path === path;
  return (
    <Button
      data-learn={path}
      title={
        learning
          ? "press a controller button… (click to cancel)"
          : binding
            ? `bound to cc${binding.cc} — click to unbind`
            : `MIDI-learn: click, then press a button — ${label} steps LIVE through the tiles`
      }
      onClick={() => {
        const action = binding != null && !learning ? "midi_unbind" : "midi_learn";
        void link.req(action, { instance: "actions", path }).catch(fail);
      }}
      sx={{
        minWidth: 0,
        px: 0.75,
        py: 0,
        fontSize: 11,
        lineHeight: "18px",
        ...(learning
          ? { bgcolor: "warning.main", color: "#000", animation: "learnpulse 0.9s infinite alternate" }
          : binding
            ? { color: "primary.main", borderColor: "primary.main" }
            : { color: "text.secondary" }),
      }}
    >
      {label} {learning ? "···" : binding ? `cc${binding.cc}` : "M"}
    </Button>
  );
}
