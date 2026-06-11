import { Box, Stack, Typography } from "@mui/material";
import type { ChangeEvent } from "react";
import type { ParamDesc } from "../engine-link";
import { useEngine } from "../hooks";

/**
 * The two global palettes as rows of five bare color swatches (R7) — no index
 * labels, no hex text; the hex lives in the native tooltip. Editing writes
 * "globals" params like everything else. DOM contract: #palettes,
 * .paletterow[data-name], input[type=color][data-path].
 */
export function Palettes({ globals }: { globals: Record<string, ParamDesc> }) {
  return (
    <Box id="palettes" sx={{ pt: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.08em" }}>
        GLOBAL PALETTES
      </Typography>
      {(["primary", "secondary"] as const).map((source) => (
        <Stack
          key={source}
          direction="row"
          className="paletterow"
          data-name={source}
          spacing={0.75}
          alignItems="center"
          sx={{ py: 0.5 }}
        >
          <Typography sx={{ width: 70, flex: "0 0 auto", fontWeight: 700 }}>{source}</Typography>
          {[0, 1, 2, 3, 4].map((i) => {
            const path = `palette.${source}.${i}`;
            const p = globals[path];
            return p ? <Swatch key={path} path={path} p={p} /> : null;
          })}
        </Stack>
      ))}
    </Box>
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
