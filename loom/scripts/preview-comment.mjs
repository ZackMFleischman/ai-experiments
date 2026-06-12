// preview-comment.mjs — build the sticky PR comment body for the Cloudflare
// Pages preview. Prints markdown to stdout.
//
//   node scripts/preview-comment.mjs <baseUrl> [shotsDir]
//
// <baseUrl>  the deployment URL from the Cloudflare deploy step
// [shotsDir] dir of rendered *.png stills served under <baseUrl>/shots/
//            (default: packages/engine-app/dist/shots)
//
// Screenshots are served from the same deploy (so the images render inline on a
// phone without committing binaries); the durable, in-diff screenshots live in
// preview/screenshots/ and are committed deliberately when authoring a visual.
import { existsSync, readdirSync } from "node:fs";

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
const shotsDir = process.argv[3] ?? "packages/engine-app/dist/shots";
if (!baseUrl) {
  console.error("usage: preview-comment.mjs <baseUrl> [shotsDir]");
  process.exit(2);
}

const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((f) => f.endsWith(".png")).sort()
  : [];

const lines = [
  "### 🧵 LOOM preview",
  "",
  `**[▶ Open the live preview](${baseUrl}/)** — the Output window.`,
  `Tweak it live in the **[Console](${baseUrl}/console.html)** (spawn library scenes, drag params).`,
  "",
];

if (shots.length) {
  lines.push("<details open><summary>Scene screenshots</summary>", "");
  for (const f of shots) {
    const name = f.replace(/\.png$/, "");
    lines.push(`**${name}**`, "", `![${name}](${baseUrl}/shots/${f})`, "");
  }
  lines.push("</details>");
}

lines.push(
  "",
  "<sub>Static build — Output + Console only; live agent/MCP editing runs in the dev session, not the preview.</sub>",
);

process.stdout.write(lines.join("\n") + "\n");
