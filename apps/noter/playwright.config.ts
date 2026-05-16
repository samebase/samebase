import { defineConfig, devices } from "@playwright/test";

const playwrightVitePort = process.env.PLAYWRIGHT_VITE_PORT ?? "4173";
const playwrightBaseUrl = `http://127.0.0.1:${playwrightVitePort}`;
const useDevServer = process.env.PLAYWRIGHT_USE_DEV_SERVER === "1";
// Production-host route tests resolve noter.md to localhost, so the test
// server must accept that Host header.
const playwrightAllowedHosts = Array.from(
  new Set([
    ...(process.env.NOTER_DEV_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter((host) => host.length > 0),
    "noter.md",
  ]),
);
const playwrightAllowedHostsEnv = `NOTER_DEV_ALLOWED_HOSTS=${playwrightAllowedHosts.join(",")}`;
// CI sets PLAYWRIGHT_SKIP_BUILD=1 after prebuilding the app in the workflow, so
// this branch reuses the built preview while local non-dev-server runs still
// rely on webServerCommand to perform the build first.
const reuseBuiltPreview = process.env.PLAYWRIGHT_SKIP_BUILD === "1";
const previewCommand = `${playwrightAllowedHostsEnv} PLAYWRIGHT=1 npm run preview -- --host 0.0.0.0 --port ${playwrightVitePort}`;
const webServerCommand = useDevServer
  ? `${playwrightAllowedHostsEnv} npm run dev:frontend -- --port=${playwrightVitePort}`
  : reuseBuiltPreview
    ? previewCommand
    : `PLAYWRIGHT=1 npm run build:ci && ${previewCommand}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/*.live.spec.ts"],
  outputDir: "./e2e/test-results",
  // CI shards should balance individual tests instead of entire files so the
  // large visual-fixture files do not bunch up on a single shard.
  fullyParallel: process.env.CI === "true",
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
    url: `${playwrightBaseUrl}/visual-fixture?mode=rich`,
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
