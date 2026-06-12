// Shared headless-Chromium GL flags for the validators.
//
// LOOM's automated checks assert against three's WebGL2 fallback (headless
// Chromium has no WebGPU adapter — see docs/architecture.md "Validation
// approach"). WHICH GL backend Chromium uses to satisfy that fallback depends
// on the host:
//   - Windows dev machines: ANGLE over D3D11 (the real GPU).
//   - Linux CI (GitHub runners): no GPU at all, so SwiftShader — Chromium's
//     software GL — drives WebGL2. Without it the canvas is black and every
//     screenshot assertion fails.
//
// Default is chosen by platform; override explicitly with
//   LOOM_GL=d3d11 | swiftshader | egl
// (e.g. force swiftshader locally to reproduce a CI render).
import { platform } from "node:os";

const choice = process.env.LOOM_GL ?? (platform() === "win32" ? "d3d11" : "swiftshader");

/** GL-backend args, spread into a validator's chromium.launch({ args }). */
export const glArgs =
  choice === "swiftshader"
    ? [
        "--enable-unsafe-webgpu",
        "--enable-features=Vulkan",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ]
    : choice === "egl"
      ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-gl=egl"]
      : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", `--use-angle=${choice}`];
