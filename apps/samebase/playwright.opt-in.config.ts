import { defineConfig } from "@playwright/test";
import playwrightConfig from "./playwright.config";

export default defineConfig({
  ...playwrightConfig,
  grep: /@opt-in/,
  grepInvert: /@logo-research/,
});
