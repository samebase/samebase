// Setup stack for Samebase. samebase.com itself stays with Workers Builds and
// apps/samebase/wrangler.jsonc; this stack owns the setup around it: the
// Worker shell, its Builds link with the deploy keys the builds use, and the
// Convex project. It also uploads the small Workers next to the app, so their
// routes and settings are code instead of Workers Builds trigger settings in
// the Cloudflare dashboard.
//
// .github/workflows/infra.yml runs it: a plan and a drift report on every pull
// request that touches the files it lists, a deploy on main. Run it from
// apps/samebase. Locally it needs a Cloudflare login (`npx alchemy login`, or
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in apps/samebase/.env) and
// the Convex CLI login (`npx convex login`, or CONVEX_ACCESS_TOKEN). The
// Cloudflare token is user-owned, because Workers Builds accepts no other kind,
// with Workers Scripts Edit, Workers Builds Configuration Edit, Secrets Store
// Edit, Account Settings Read, plus Workers Routes Edit and Zone Read on
// samebase.com, json.md and xml.md:
//   npx alchemy plan --stage prod
import * as WorkersBuilds from "@samebase/alchemy-cloudflare-workers-builds";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

// The team id, not the slug: CI authenticates with a team access token, and
// Convex answers the slug lookup only for a user login.
const CONVEX_TEAM = 38516;
const CONVEX_PROJECT = "samebase";

export default Alchemy.Stack(
  "Samebase",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      WorkersBuilds.providers(),
      Convex.providers(),
    ),
    // State lives in the Cloudflare state store of the account, so a laptop
    // and infra.yml share it.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // samebase.com. Workers Builds keeps deploying it; the stack owns the
    // Worker shell by name, its Builds link, and the Convex project with the
    // deploy keys the builds use. Commands and paths are the Builds settings
    // from the dashboard, so the first deploy changes no build. The variables
    // it writes replace the hand-set CONVEX_DEPLOY_KEY with keys it minted;
    // the provider keeps variables it did not write, so the hand-set
    // PROD_POSTHOG_PROJECT_TOKEN stays. Everything here is retained on
    // destroy: it is the production app.
    const worker = yield* WorkersBuilds.Worker("Worker", { name: "samebase" }).pipe(
      adopt(true),
      Alchemy.RemovalPolicy.retain(),
    );

    // Found by name when it has no state, then by id; adopt(true) takes over
    // the project that existed before this stack. Convex.Project retains by
    // default since alchemy-convex 0.2.0; the explicit retain keeps that
    // visible here.
    const project = yield* Convex.Project("Project", {
      team: CONVEX_TEAM,
      name: CONVEX_PROJECT,
    }).pipe(adopt(true), Alchemy.RemovalPolicy.retain());
    const deployment = project.prodDeploymentName.as<string>();

    // Exactly the actions scripts/build-cloudflare.ts names for the production
    // key. Without allowedActions, Convex grants every deployment action,
    // including data writes and backup deletes. Both keys are retained like
    // the Builds configuration that holds them: a destroy that revoked them
    // would leave every later build failing to authenticate.
    const deployKey = yield* Convex.DeployKey("DeployKey", {
      deployment,
      name: "workers-builds",
      allowedActions: [
        "deployment:deploy",
        "deployment:env:view",
        "deployment:env:write",
        "deployment:data:view",
      ],
    }).pipe(Alchemy.RemovalPolicy.retain());
    const previewKey = yield* Convex.PreviewDeployKey("PreviewDeployKey", {
      projectId: project.projectId,
      name: "workers-builds",
    }).pipe(Alchemy.RemovalPolicy.retain());

    yield* WorkersBuilds.Repository("Builds", {
      worker: worker.workerId,
      rootDirectory: "apps/samebase",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: [
        "apps/samebase/*",
        "packages/dependent/*",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "package.json",
        ".nvmrc",
      ],
      // scripts/build-cloudflare.ts reads CONVEX_DEPLOY_KEY: the production
      // key on main, the project preview key on other branches. Samebase reads
      // SAMEBASE_CONVEX_PROJECT to link the Worker to its Convex project.
      variables: {
        CONVEX_DEPLOY_KEY: deployKey.deployKey,
        SAMEBASE_CONVEX_PROJECT: Output.interpolate`version=1&teamId=${project.teamId}&projectId=${project.projectId}`,
      },
      previewVariables: { CONVEX_DEPLOY_KEY: previewKey.previewDeployKey },
    }).pipe(adopt(true), Alchemy.RemovalPolicy.retain());

    // The PostHog reverse proxy on e.samebase.com. The name is the Worker that
    // Workers Builds deployed before this stack, so Alchemy finds it by name.
    // adopt(true) lets the first deploy take over that Worker and its route,
    // which carry no Alchemy ownership tags. main is relative to apps/samebase,
    // where this stack runs; Alchemy saves main in the state as written and
    // reuses it when it repairs drift, so a file URL would pin the path of the
    // machine that deployed last. Compatibility date and observability are
    // Alchemy's defaults. workers.dev is off: the proxy has one address.
    // Retained on destroy: samebase.com analytics run through it.
    const posthogProxy = yield* Cloudflare.Worker("PosthogProxy", {
      name: "samebase-posthog-proxy",
      main: "../posthog-proxy/src/index.ts",
      workersDev: false,
      routes: [{ pattern: "e.samebase.com/*", zoneName: "samebase.com" }],
    }).pipe(adopt(true), Alchemy.RemovalPolicy.retain());

    // The domain router: redirects registered <label>.json.md and
    // <label>.xml.md hostnames to their targets, declared in its source. Same
    // takeover as the proxy. The CI token needs Workers Routes on json.md and
    // xml.md. This is a test outside the Samebase app, so it is not retained:
    // deleting it here deletes the Worker and its routes.
    const domains = yield* Cloudflare.Worker("Domains", {
      name: "samebase-domains",
      main: "../domain-router/src/index.ts",
      workersDev: false,
      routes: [
        { pattern: "*.json.md/*", zoneName: "json.md" },
        { pattern: "*.xml.md/*", zoneName: "xml.md" },
      ],
    }).pipe(adopt(true));

    return { url: worker.url, posthogProxy: posthogProxy.url, domains: domains.url };
  }),
);
