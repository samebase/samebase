// The Alchemy stack of the sidebars example. .github/workflows/alchemy.yml runs it from this folder
// after the stack of the app: the stage `prod` on each push to main, and the stage `pr-<number>` on
// each pull request, a Worker of its own that `alchemy destroy` deletes when the pull request
// closes. Build first, as Workers Builds did in this folder:
//   pnpm install && pnpm run build && npx alchemy plan --stage prod --no-input
//
// The stack name is the repository and the folder of this file: a stack of the repository root is
// named samebase/samebase, and a stack in a folder samebase/samebase/<folder>. Its state is in the
// `alchemy-state-store` project of the Convex team, where the repository pages of Samebase read it. A run
// needs the team token CONVEX_ACCESS_TOKEN, or the Convex CLI login (`npx convex login`) on a
// laptop, and a Cloudflare login (`npx alchemy login`, or CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in .env) with Workers Scripts Edit.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "samebase/samebase/apps/sidebars-example",
  {
    providers: Cloudflare.providers(),
    state: Convex.state({ team: "nicu" }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    // At `prod`, the Worker that Workers Builds deployed before this stack, found by its name. The
    // first deploy takes it over only with --adopt. It serves only the build output, with the
    // settings of wrangler.jsonc, and keeps its custom domain sidebars.samebase.com, which no prop
    // here manages. Any other stage is a Worker with the name of the stage.
    const site = yield* Cloudflare.Worker("Site", {
      name:
        stage === "prod"
          ? "samebase-monorepo-sidebars-example"
          : `samebase-monorepo-sidebars-example-${stage}`,
      assets: {
        directory: "./dist/client",
        htmlHandling: "none",
        notFoundHandling: "single-page-application",
      },
      compatibility: { date: "2026-05-14" },
    });

    return { url: site.url };
  }),
);
