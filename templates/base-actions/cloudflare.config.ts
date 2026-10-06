// The Worker of this app: static assets, no Worker code. It owns everything of
// the Worker version: the assets, the compatibility date, and Preview URLs.
// scripts/build-worker.ts evaluates this file through the Wrangler bundler and
// writes Build Output to .cloudflare/output/v0/. Workers Builds then runs
// `cf deploy --prebuilt` on main and `cf previews deploy --prebuilt` on other
// branches, which upload that output without evaluating the file again.
// wrangler.config.ts holds the build settings of the bundler.
//
// The setup stack (alchemy.run.ts) imports `worker` for its name, so the
// Worker shell it creates and the Worker that Workers Builds deploys are the
// same Worker. Keep `worker` a plain object so that import needs no config
// context.
import process from "node:process";
import { defineConfig, defineWorker } from "cf/config";

import { deployNames } from "./scripts/deploy-names.ts";

export const worker = defineWorker({
  // Workers Builds sets WRANGLER_CI_OVERRIDE_NAME to the name of the
  // connected Worker and does not set GITHUB_REPOSITORY. Wrangler honors the
  // variable; cf 1.0.0-beta.12 does not, so the config reads it here. The
  // setup stack and local commands see no variable and get the name from
  // GITHUB_REPOSITORY.
  name: process.env["WRANGLER_CI_OVERRIDE_NAME"] ?? deployNames().worker,
  compatibilityDate: "2026-05-14",
  previewUrls: true,
  assets: {
    htmlHandling: "none",
    // Cloudflare SPA mode serves /index.html for unknown app routes. Keep
    // vite.config.ts emitting the TanStack Start shell there.
    notFoundHandling: "single-page-application",
  },
});

export default defineConfig({ worker });
