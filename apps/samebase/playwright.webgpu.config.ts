import { defineConfig, devices } from "@playwright/test";
import playwrightConfig from "./playwright.config";

export default defineConfig({
  ...playwrightConfig,
  grep: /@webgpu/,
  grepInvert: [],
  testIgnore: "**/*.live.spec.ts",
  use: {
    ...playwrightConfig.use,
    launchOptions: {
      args: [
        "--disable-session-crashed-bubble",
        "--enable-unsafe-webgpu",
        "--enable-features=UseSkiaRenderer,Vulkan",
        "--use-angle=swiftshader",
        "--use-vulkan=swiftshader",
        "--use-webgpu-adapter=swiftshader",
        "--disable-vulkan-surface",
        "--use-gpu-in-tests",
      ],
    },
  },
  projects: [
    {
      name: "software WebGPU",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
      },
    },
  ],
});
