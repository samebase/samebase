import { defineConfig, devices } from "@playwright/test";

const playwrightVitePort = process.env.PLAYWRIGHT_VITE_PORT ?? "4173";
const playwrightBaseUrl = `http://127.0.0.1:${playwrightVitePort}`;
const useDevServer = process.env.PLAYWRIGHT_USE_DEV_SERVER === "1";
const webServerCommand = useDevServer
  ? `VITE_PORT=${playwrightVitePort} npm run dev:frontend`
  : `PLAYWRIGHT=1 npm run build:ci && npm run preview -- --host 0.0.0.0 --port ${playwrightVitePort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/*.live.spec.ts"],
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: playwrightBaseUrl,
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      // Three-based visual fixtures need explicit WebGL software rendering in headless Chromium.
      args: [
        "--disable-session-crashed-bubble",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: webServerCommand,
    url: `${playwrightBaseUrl}/visual-fixture.html?mode=rich`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1",
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
