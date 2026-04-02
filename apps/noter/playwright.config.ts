import { defineConfig, devices } from "@playwright/test";

const playwrightVitePort = process.env.PLAYWRIGHT_VITE_PORT ?? "4173";
const playwrightBaseUrl = `http://127.0.0.1:${playwrightVitePort}`;
const useDevServer = process.env.PLAYWRIGHT_USE_DEV_SERVER === "1";
const webServerCommand = useDevServer
  ? `npm run dev:frontend -- --port=${playwrightVitePort}`
  : `PLAYWRIGHT=1 npm run build:ci && PLAYWRIGHT=1 npm run preview -- --host 0.0.0.0 --port ${playwrightVitePort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/*.live.spec.ts"],
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "./e2e/playwright-report",
      },
    ],
  ],
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: playwrightBaseUrl,
    headless: true,
    // Keep failure traces and screenshots so CI artifact uploads show the
    // actual Linux-rendered output instead of only log paths.
    trace: "retain-on-failure",
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
