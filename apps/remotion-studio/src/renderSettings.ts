import type { WebpackOverrideFn } from "@remotion/bundler";
import type { ChromiumOptions } from "@remotion/renderer";
// The named export survives both Node ESM and the CommonJS interop that loads remotion.config.ts.
import { webpackPlugin as typegpuWebpackPlugin } from "unplugin-typegpu";

/**
Shared by `remotion.config.ts` for CLI renders and by scripts that call `bundle()` and
`openBrowser()` directly.

TypeGPU turns `"use gpu"` functions into WGSL from build-time metadata, so the bundle needs its
plug-in.
*/
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  plugins: [...(config.plugins ?? []), typegpuWebpackPlugin()],
});

/**
Remotion always launches Chrome with `--enable-unsafe-webgpu` and `--ignore-gpu-blocklist`, and it
serves the bundle from `http://localhost`, which is a secure context. With ANGLE, the headless shell
on an Apple silicon Mac exposes the Metal WebGPU adapter, so WebGPU needs no other flag.
*/
export const chromiumOptions = { gl: "angle" } as const satisfies ChromiumOptions;

/**
The Windows headless shell ships without `dxil.dll` and `dxcompiler.dll`, so `requestDevice()` fails
there with `DynamicLib.Open: dxil.dll`. Chrome for Testing ships both.

On a laptop with an integrated and a discrete GPU, Windows Chrome gives WebGPU the integrated GPU and
ignores `powerPreference`, and the film hangs that GPU. Set the Chrome for Testing `chrome.exe` under
`node_modules/.remotion` to "High performance" in the Windows Graphics settings.
*/
export const chromeMode = process.platform === "win32" ? "chrome-for-testing" : "headless-shell";
