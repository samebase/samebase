// The Worker of this app: static assets, no Worker code. It owns everything of
// the Worker version. scripts/build-worker.ts evaluates it through the Wrangler
// bundler into .cloudflare/output/v0/, and the deploy scripts upload that
// output with cf. wrangler.config.ts holds the bundler settings.
//
// alchemy.run.ts imports `worker` for its name, so the Worker shell and the
// deployed Worker are one Worker. Keep `worker` a plain object so that import
// needs no config context.
import process from "node:process";
import { defineConfig, defineWorker } from "cf/config";

import { deployNames } from "./scripts/deploy-names.ts";

export const worker = defineWorker({
  // Workers Builds sets WRANGLER_CI_OVERRIDE_NAME to the connected Worker and
  // no GITHUB_REPOSITORY; cf 1.0.0-beta.12 does not read the variable itself.
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
