import { Box, Button, Stack, Typography } from "@mui/material";
import type { SessionSnapshot } from "@loom/sidecar/protocol";
import type { ParamDesc } from "../engine-link";
import { useEngine, useThumb } from "../hooks";
import { fail } from "../util";
import { ParamPanel } from "./ParamPanel";

type Props = {
  instance: string | null;
  manifest: Record<string, ParamDesc> | undefined;
  session: SessionSnapshot;
  onExit: () => void;
};

/**
 * Preview mode (toggled by the Header button or the "p" hotkey): the selected
 * instance blown up full-screen with only the params drawer alongside — a
 * focused "audition this candidate" view without the tile grid in the way.
 *
 * The big image is the instance's own 640×360 preview thumbnail (the live entry
 * mirrors the Output canvas; everyone else reads back their offscreen target),
 * cover-scaled exactly like /staged.html so the framing matches the Output
 * window. Reuses ParamPanel so its widgets, FX chain, and stage/GO LIVE buttons
 * all come for free; the slim header repeats GO LIVE so sending to live stays
 * one tap even when the drawer is collapsed. DOM contract: #preview-mode,
 * #preview-image, #preview-name, #preview-stage, #preview-golive, #preview-exit.
 */
export function PreviewMode({ instance, manifest, session: s, onExit }: Props) {
  const link = useEngine();
  const thumb = useThumb(instance);
  const inst = instance != null ? s.instances.find((i) => i.id === instance) : undefined;
  const scene = inst?.scene;
  const name =
    instance == null ? "—" : scene && scene !== instance ? `${instance} · ${scene}` : instance;
  const isLive = instance != null && s.live === instance;
  const isStaged = instance != null && s.staged === instance;
  // globals is the rack/palette pseudo-instance, never something to project.
  const stageable = instance != null && instance !== "globals";
  const has = stageable && thumb != null;

  return (
    <Box
      id="preview-mode"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: (t) => t.zIndex.modal,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        alignItems="center"
        component="header"
        sx={{
          px: 1.25,
          py: 0.5,
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
          flex: "0 0 auto",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ letterSpacing: "0.16em", fontWeight: 700 }}
        >
          PREVIEW
        </Typography>
        <Typography id="preview-name" sx={{ fontWeight: 700 }} noWrap>
          {name}
        </Typography>
        {isLive && (
          <Typography variant="caption" sx={{ color: "error.main", fontWeight: 700 }}>
            LIVE
          </Typography>
        )}
        {isStaged && (
          <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 700 }}>
            STAGED
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {stageable && (
          <>
            <Button
              id="preview-stage"
              variant="outlined"
              disabled={isLive}
              onClick={() =>
                void link
                  .req(isStaged ? "unstage" : "stage", isStaged ? {} : { instance })
                  .catch(fail)
              }
              sx={{ fontSize: 12, py: 0.25 }}
            >
              {isStaged ? "unstage" : "stage"}
            </Button>
            <Button
              id="preview-golive"
              variant="contained"
              color="error"
              disabled={isLive || s.panicked}
              title="stage this scene and crossfade it LIVE now"
              onClick={() =>
                void link.req("stage", { instance }).then(() => link.req("commit", {})).catch(fail)
              }
              sx={{ fontSize: 12, fontWeight: 700, py: 0.25 }}
            >
              {isLive ? "LIVE" : "GO LIVE"}
            </Button>
          </>
        )}
        <Button
          id="preview-exit"
          onClick={onExit}
          title="exit preview (p / Esc)"
          sx={{ minWidth: 0, px: 1, fontSize: 16, lineHeight: 1 }}
        >
          ✕
        </Button>
      </Stack>
      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box
          id="preview-view"
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#000",
          }}
        >
          <Box
            component="img"
            id="preview-image"
            alt=""
            src={has ? thumb : undefined}
            // Same presentation as the Output window: fill the area, cover-scaled.
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: has ? "block" : "none",
            }}
          />
          <Typography id="preview-empty" color="text.secondary" sx={{ display: has ? "none" : "block" }}>
            {stageable ? "waiting for preview…" : "select an instance tile to preview"}
          </Typography>
        </Box>
        <ParamPanel instance={instance} manifest={manifest} session={s} />
      </Box>
    </Box>
  );
}
