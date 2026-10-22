// The Alchemy stack of the sidebars example. .github/workflows/alchemy.yml runs it from this folder
// after the stack of the repository root, on each push to main: the stage `prod` only, so pull
// requests get no preview of the example. Build first, as Workers Builds did in this folder:
//   pnpm install && pnpm run build && npx alchemy plan --stage prod --no-input
//
// The stack name is the repository and the folder of this file: a stack of the repository root is
// named samebase/samebase, and a stack in a folder samebase/samebase/<folder>. Its state is in the
// `alchemy-state` project of the Convex team, where the repository pages of Samebase read it. A run
// needs the team token CONVEX_ACCESS_TOKEN, or the Convex CLI login (`npx convex login`) on a
// laptop, and a Cloudflare login (`npx alchemy login`, or CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in .env) with Workers Scripts Edit.
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "samebase/samebase/apps/sidebars-example",
  {
    providers: Cloudflare.providers(),
    state: Convex.state({ team: "nicu" }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    if (stage !== "prod") {
      // Any other stage would declare a second Worker with the same name.
      return yield* Effect.die(
        new Error(`The sidebars example has only the stage prod, not ${stage}.`),
      );
    }

    // The Worker that Workers Builds deployed before this stack, found by its name. The first
    // deploy takes it over only with --adopt. It serves only the build output, with the settings
    // of wrangler.jsonc, and keeps its custom domain sidebars.samebase.com, which no prop here
    // manages.
    const site = yield* Cloudflare.Worker("Site", {
      name: "samebase-monorepo-sidebars-example",
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
