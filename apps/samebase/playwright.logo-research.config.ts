import { defineConfig, devices } from "@playwright/test";
import playwrightConfig from "./playwright.config";

export default defineConfig({
  ...playwrightConfig,
  grepInvert: [],
  projects: [
    {
      name: "logo specs",
      testIgnore: "**/*.live.spec.ts",
      testMatch: "**/logo-*.spec.ts",
      use: devices["Desktop Chrome"],
    },
    {
      grep: /@logo-research/,
      name: "embedded logo research",
      testIgnore: ["**/*.live.spec.ts", "**/logo-*.spec.ts"],
      use: devices["Desktop Chrome"],
    },
  ],
});
