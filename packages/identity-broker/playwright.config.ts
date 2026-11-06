import { defineConfig, devices } from "@playwright/test";

/**
 * Screenshots of every page the broker renders, in each state, light and dark, on a phone and a
 * desktop. The pages are plain HTML from `src/client/html.ts`, so a test sets the content itself:
 * no server and no app build. `screenshots/` is the gallery of every state. Make and check the
 * images in Linux with `pnpm run test:pages` (`-- --update-snapshots` to make them again), as CI
 * does.
 */
export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.pages.test.ts",
  outputDir: "./.playwright/test-results",
  snapshotPathTemplate: "{testDir}/../screenshots/{arg}{ext}",
  reporter: [["list"], ["html", { open: "never", outputFolder: "./.playwright/report" }]],
  use: { headless: true },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
