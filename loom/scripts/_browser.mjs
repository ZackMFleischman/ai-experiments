// Shared headless-Chromium GL flags for the validators.
//
// LOOM's automated checks assert against three's WebGL2 fallback — their pixel
// thresholds are calibrated for it (see docs/architecture.md "Validation
// approach"). WHICH GL backend Chromium uses depends on the host:
//   - Windows dev machines: ANGLE over D3D11 (the real GPU). WebGPU is enabled
//     (--enable-unsafe-webgpu) because it works there; three falls back to
//     WebGL2 only if no adapter is found.
//   - Linux CI (GitHub runners): no GPU, so SwiftShader (Chromium's software GL)
//     drives WebGL2. Crucially we must NOT enable WebGPU here: enabling it gives
//     navigator.gpu a half-working software adapter, three then picks the WebGPU
//     path, and SwiftShader renders it as a blank white canvas — every
//     screenshot assertion then fails on rgb(255,255,255). Leaving WebGPU off
//     (and disabling it explicitly) keeps navigator.gpu undefined, so three uses
//     the WebGL2 fallback the checks expect.
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
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-features=WebGPU", // force three onto its WebGL2 fallback
      ]
    : choice === "egl"
      ? ["--use-gl=egl", "--disable-features=WebGPU"]
      : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", `--use-angle=${choice}`];
