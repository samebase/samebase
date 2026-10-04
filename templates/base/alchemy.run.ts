// Spike: deploy the Samebase base template with Alchemy v2 instead of Workers Builds.
// Phase A only: one assets-only Worker on a dev stage, local state in .alchemy/.
// The Worker name carries the temporary prefix so it is easy to find and remove.
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "SamebaseBaseSpike",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const site = yield* Cloudflare.Website.StaticSite("Website", {
      name: "tmp-alchemy-spike-base",
      // Frontend-only build (WORKERS_CI unset): vp run build:app with VITE_CONVEX_URL from .env.local.
      command: "node ./scripts/build-cloudflare.ts",
      outdir: "dist/client",
      assets: {
        htmlHandling: "none",
        notFoundHandling: "single-page-application",
      },
    });

    return {
      url: site.url,
    };
  }),
);
