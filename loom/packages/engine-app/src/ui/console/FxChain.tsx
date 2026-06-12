import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import type { ChainStepInfo } from "@loom/sidecar/protocol";
import type { ParamDesc } from "../engine-link";
import { useEngine, useEngineState } from "../hooks";
import { ParamWidget } from "./ParamWidget";

type Props = {
  instance: string;
  manifest: Record<string, ParamDesc>;
};

/** A step's manifest knobs (everything under fx.<id>. except the wet/dry mix). */
function stepKnobs(
  manifest: Record<string, ParamDesc>,
  id: string,
): Array<[string, ParamDesc]> {
  const head = `fx.${id}.`;
  return Object.entries(manifest)
    .filter(([path]) => path.startsWith(head) && path !== `${head}mix`)
    .map(([path, p]) => [path, p] as [string, ParamDesc]);
}

/**
 * The per-instance post-effect chain (M6): ordered step cards (source→output),
 * each with a wet/dry mix you can ride or MIDI-bind, drag-to-reorder, insertion
 * points between steps, a "+ effect" picker fed by the library (code primitives
 * + saved chains), restore-default, and "save as effect". Structural edits go
 * through one full-list set_chain; knob/mix rides are plain set_param.
 */
export function FxChain({ instance, manifest }: Props) {
  const link = useEngine();
  const { session } = useEngineState();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [pick, setPick] = useState<{ anchor: HTMLElement; index: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const chain: ChainStepInfo[] = useMemo(
    () => session?.instances.find((i) => i.id === instance)?.chain ?? [],
    [session, instance],
  );
  const effects = session?.availableEffects ?? [];
  const primitives = effects.filter((e) => e.kind === "primitive");
  const composites = effects.filter((e) => e.kind === "composite");

  // Every structural edit is a full-list set_chain; ids are kept so surviving
  // steps keep their knobs (params/mix omitted → the engine carries them forward).
  const apply = (steps: Array<{ id?: string; effect: string }>) => {
    setErr(null);
    void link.req("set_chain", { instance, steps }).catch((e: Error) => setErr(e.message));
  };
  const ids = (): Array<{ id?: string; effect: string }> =>
    chain.map((s) => ({ id: s.id, effect: s.effect }));

  const insert = (effect: string, index: number) => {
    const next = ids();
    next.splice(index, 0, { effect });
    apply(next);
    setPick(null);
  };
  const remove = (id: string) => apply(ids().filter((s) => s.id !== id));
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = ids();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    apply(next);
  };
  const restore = () => {
    setErr(null);
    void link.req("set_chain", { instance, restoreDefault: true }).catch((e: Error) => setErr(e.message));
  };
  const save = () => {
    const name = saveName.trim();
    if (!name) return;
    setErr(null);
    void link
      .req("save_chain", { instance, name })
      .then(() => {
        setSaveOpen(false);
        setSaveName("");
      })
      .catch((e: Error) => setErr(e.message));
  };

  // A thin insertion affordance between/around cards.
  const inserter = (index: number) => (
    <Box
      data-fxinsert={index}
      onClick={(e) => setPick({ anchor: e.currentTarget, index })}
      sx={{
        height: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary",
        cursor: "pointer",
        opacity: 0.5,
        "&:hover": { opacity: 1, color: "primary.main" },
        "&::before, &::after": { content: '""', flex: 1, borderTop: 1, borderColor: "divider", mx: 1 },
      }}
    >
      <Typography variant="caption">+ insert</Typography>
    </Box>
  );

  return (
    <Box id="fxchain" sx={{ mt: 1 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ flex: 1, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
        >
          FX chain{chain.length > 0 ? ` · ${chain.length}` : ""}
        </Typography>
        <Tooltip title="restore the scene's default chain">
          <Button
            data-fxrestore
            size="small"
            onClick={restore}
            sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: 11, color: "text.secondary" }}
          >
            ⟳ restore
          </Button>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, opacity: 0.7 }}>
        signal flows ↓ source → output
      </Typography>

      {err != null && (
        <Typography variant="caption" sx={{ display: "block", color: "error.main", mb: 0.5 }}>
          {err}
        </Typography>
      )}

      {inserter(0)}
      {chain.map((step, i) => {
        const mix = manifest[`fx.${step.id}.mix`];
        const dim = typeof mix?.value === "number" && mix.value < 0.02;
        return (
          <Box key={step.id}>
            <Box
              data-fxstep={step.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDrop={() => {
                if (drag != null) reorder(drag, i);
                setDrag(null);
                setOver(null);
              }}
              sx={{
                border: 1,
                borderColor: over === i ? "primary.main" : "divider",
                borderRadius: 1,
                p: 0.75,
                mb: 0.25,
                bgcolor: "background.default",
                opacity: dim ? 0.55 : 1,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Box
                  draggable
                  onDragStart={() => setDrag(i)}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  title="drag to reorder"
                  sx={{ cursor: "grab", color: "text.secondary", fontSize: 14, px: 0.25 }}
                >
                  ⠿
                </Box>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }} noWrap title={step.effect}>
                  {step.kind === "composite" ? "✦ " : ""}
                  {step.effect}
                </Typography>
                <Tooltip title="remove from chain">
                  <IconButton
                    size="small"
                    data-fxremove={step.id}
                    onClick={() => remove(step.id)}
                    sx={{ color: "text.secondary", fontSize: 14, p: 0.25 }}
                  >
                    ✕
                  </IconButton>
                </Tooltip>
              </Stack>
              {mix != null && (
                <ParamWidget instance={instance} path={`fx.${step.id}.mix`} p={mix} label="mix" dense />
              )}
              {stepKnobs(manifest, step.id).map(([path, p]) => (
                <ParamWidget
                  key={path}
                  instance={instance}
                  path={path}
                  p={p}
                  label={path.slice(`fx.${step.id}.`.length)}
                  dense
                />
              ))}
            </Box>
            {inserter(i + 1)}
          </Box>
        );
      })}

      {chain.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          No effects. Add one to post-process this instance.
        </Typography>
      )}

      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
        <Button
          data-fxadd
          size="small"
          variant="outlined"
          onClick={(e) => setPick({ anchor: e.currentTarget, index: chain.length })}
          sx={{ flex: 1, fontSize: 11, py: 0.25 }}
        >
          + effect
        </Button>
        {chain.length > 0 && (
          <Button
            data-fxsave
            size="small"
            onClick={() => setSaveOpen(true)}
            sx={{ fontSize: 11, py: 0.25, color: "text.secondary" }}
          >
            ⌑ save as…
          </Button>
        )}
      </Stack>

      <Menu open={pick != null} anchorEl={pick?.anchor ?? null} onClose={() => setPick(null)}>
        <ListSubheader sx={{ lineHeight: "24px", bgcolor: "transparent" }}>primitives</ListSubheader>
        {primitives.map((e) => (
          <MenuItem key={e.name} data-fxpick={e.name} dense onClick={() => insert(e.name, pick!.index)}>
            {e.name}
          </MenuItem>
        ))}
        {composites.length > 0 && (
          <ListSubheader sx={{ lineHeight: "24px", bgcolor: "transparent" }}>saved chains</ListSubheader>
        )}
        {composites.map((e) => (
          <MenuItem key={e.name} data-fxpick={e.name} dense onClick={() => insert(e.name, pick!.index)}>
            ✦ {e.name}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)}>
        <DialogTitle sx={{ fontSize: 16 }}>Save chain as effect</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            size="small"
            margin="dense"
            label="name (lowerCamelCase)"
            fullWidth
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            helperText="writes content/modules/effects/chains/<name>.chain.json"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>cancel</Button>
          <Button onClick={save} variant="contained" disabled={saveName.trim() === ""}>
            save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
