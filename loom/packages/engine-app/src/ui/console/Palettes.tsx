import { Box, Button, NativeSelect, Stack, Typography } from "@mui/material";
import type { ChangeEvent } from "react";
import type { ParamDesc } from "../engine-link";
import { useEngine } from "../hooks";
import { getPreset, listPresets, matchPreset, savePreset, type PaletteStops } from "../palette-presets";

/**
 * The two global palettes as rows of five bare color swatches (R7) — no index
 * labels, no hex text; the hex lives in the native tooltip. Each row carries a
 * preset dropdown (applies a named 5-stop palette live) and "save as…" (names
 * the current stops). Editing writes "globals" params like everything else.
 * DOM contract: #palettes, .paletterow[data-name], input[type=color][data-path].
 */
export function Palettes({ globals }: { globals: Record<string, ParamDesc> }) {
  return (
    <Box id="palettes" sx={{ pt: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.08em" }}>
        GLOBAL PALETTES
      </Typography>
      {(["primary", "secondary"] as const).map((source) => (
        <PaletteRow key={source} source={source} globals={globals} />
      ))}
    </Box>
  );
}

function PaletteRow({
  source,
  globals,
}: {
  source: "primary" | "secondary";
  globals: Record<string, ParamDesc>;
}) {
  const link = useEngine();
  const stops = [0, 1, 2, 3, 4].map((i) => globals[`palette.${source}.${i}`]);
  if (stops.some((p) => p == null)) return null;
  const hexes = stops.map((p) => String(p!.value));
  const current = matchPreset(hexes);

  const apply = (name: string) => {
    const preset = getPreset(name);
    if (!preset) return;
    preset.forEach((hex, i) => link.sendParam("globals", `palette.${source}.${i}`, hex));
  };
  const saveAs = () => {
    const name = window.prompt(`Save the ${source} palette as…`, current ?? "")?.trim();
    if (name) savePreset(name, hexes as PaletteStops);
  };

  return (
    <Stack
      direction="row"
      className="paletterow"
      data-name={source}
      spacing={0.75}
      alignItems="center"
      sx={{ py: 0.5 }}
    >
      <Typography sx={{ width: 70, flex: "0 0 auto", fontWeight: 700 }}>{source}</Typography>
      {[0, 1, 2, 3, 4].map((i) => (
        <Swatch key={i} path={`palette.${source}.${i}`} p={stops[i]!} />
      ))}
      <NativeSelect
        value={current ?? ""}
        sx={{ ml: 1, fontSize: 12 }}
        inputProps={{ title: "apply a named palette" }}
        onChange={(e) => apply(e.target.value)}
      >
        <option value="" disabled>
          {current ?? "custom…"}
        </option>
        {listPresets().map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </NativeSelect>
      <Button onClick={saveAs} title="name the current stops as a preset" sx={{ fontSize: 11 }}>
        save as…
      </Button>
    </Stack>
  );
}

function Swatch({ path, p }: { path: string; p: ParamDesc }) {
  const link = useEngine();
  const hex = String(p.value);
  return (
    <Box
      component="input"
      type="color"
      value={hex}
      data-path={path}
      title={`${path} · ${hex}`}
      onChange={(e: ChangeEvent<HTMLInputElement>) => link.sendParam("globals", path, e.target.value)}
      sx={{
        width: 30,
        height: 30,
        p: 0,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "transparent",
        cursor: "pointer",
        "&::-webkit-color-swatch-wrapper": { p: "3px" },
        "&::-webkit-color-swatch": { border: "none", borderRadius: "2px" },
      }}
    />
  );
}
