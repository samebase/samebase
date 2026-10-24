// The Alchemy stack of samebase.com. .github/workflows/alchemy.yml runs it from the repository root:
//
// - Stage `prod`, on each push to main: the Convex project `samebase`, its production deployment,
//   which serves samebase.com through convex-hosting, and the Workers next to the app, so their
//   routes and settings are code instead of settings in the Cloudflare dashboard.
// - Stage `pr-<number>`, on each pull request: a Convex preview deployment with the name of the
//   stage, which `alchemy destroy` deletes when the pull request closes. It reads the project by its
//   slug, so it does not depend on the state of `prod`, and it creates no Workers.
//
// The state of every stage is in the `alchemy-state` project of the Convex team, under the stack
// name samebase/samebase, where the repository pages of Samebase read it. A stack in a folder of
// this repository is named samebase/samebase/<folder>, such as apps/sidebars-example/alchemy.run.ts,
// and runs from its folder. Every run needs the team token CONVEX_ACCESS_TOKEN, or the Convex CLI
// login (`npx convex login`) on a laptop; it mints the deploy key of each push itself. The stage
// `prod` also needs a Cloudflare login (`npx alchemy login`, or CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in .env). That token needs Workers Scripts Edit and Account Settings Read,
// plus Workers Routes Edit and Zone Read on samebase.com, json.md and xml.md. The build reads the
// variables that alchemy.yml sets on each deploy step, such as VITE_SAMEBASE_ROUTE_ENVIRONMENT.
//   npx alchemy plan --stage prod --no-input
import { execFileSync } from "node:child_process";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** The Convex team of the project and of the state. */
const team = "nicu";

/**
The commit of this checkout. The build puts it and its number into the app (vite.config.ts), so it is
part of the content identity of each push, as the Convex variable SAMEBASE_COMMIT: every commit
deploys, also one that changes only files outside apps/samebase, such as a workspace package.
*/
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

export default Alchemy.Stack(
  "samebase/samebase",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), Convex.providers()),
    state: Convex.state({ team }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;

    if (stage !== "prod") {
      // The project of samebase.com, read by its slug: this stage never creates, changes, or
      // deletes it. adopt(true) takes it into the state of this stage only.
      const project = yield* Convex.Project("Project", { team, slug: "samebase" }).pipe(
        adopt(true),
      );

      // Built like production with the route environment `preview`. The push command, relative to
      // rootDir, also sets SITE_URL to the preview's site URL and seeds the password account.
      // adopt(true) takes over a preview with the name of this stage that an interrupted run left
      // behind.
      const site = yield* Convex.Deployment("Site", {
        project,
        type: "preview",
        name: stage,
        rootDir: "apps/samebase",
        env: { SAMEBASE_COMMIT: commit },
        source: { path: "./convex", command: ["node", "./scripts/deploy-preview.ts"] },
      }).pipe(adopt(true), Alchemy.RemovalPolicy.destroy());

      const github = yield* GitHub.GitHubEnv;
      if (github?.pr) {
        // Retained: a closed pull request keeps the comment as a record of what was deployed.
        yield* GitHub.Comment("PreviewComment", {
          owner: github.owner,
          repository: github.repository,
          issueNumber: github.pr,
          body: Output.interpolate`Preview \`${stage}\`: ${site.siteUrl}
Deployment: ${site.url}
Dashboard: https://dashboard.convex.dev/d/${site.name}`,
        }).pipe(Alchemy.RemovalPolicy.retain());
      }

      return { url: site.siteUrl };
    }

    // The Convex project that runs samebase.com. Found by name when it has no state, then by id;
    // adopt(true) takes over the project that existed before this stack. Retained on destroy: it is
    // the production app.
    const project = yield* Convex.Project("Project", { team, name: "samebase" }).pipe(
      adopt(true),
      Alchemy.RemovalPolicy.retain(),
    );

    // The production deployment that serves samebase.com. The push runs in rootDir, the app with
    // its package.json: the `deploy` script, which is the build, the upload of the site, and
    // `convex deploy`. A run takes over a production deployment with code that is not in state only
    // with --adopt.
    const site = yield* Convex.Deployment("Site", {
      project,
      type: "prod",
      rootDir: "apps/samebase",
      env: { SAMEBASE_COMMIT: commit },
      source: { path: "./convex", command: ["node", "--run", "deploy"] },
    });

    // The PostHog reverse proxy on e.samebase.com, part of the Samebase app, with its code in the
    // folder of the app. The name is the Worker that Workers Builds deployed before this stack, so
    // Alchemy finds it by name. adopt(true) lets the first deploy take over that Worker and its
    // route, which carry no Alchemy ownership tags. main is relative to the repository root, where
    // this stack runs: Alchemy's Cloudflare.Worker has no rootDir.
    // Alchemy saves main in the state as written and reuses it when it repairs drift, so a file
    // URL would pin the path of the machine that deployed last. Compatibility date and
    // observability are Alchemy's defaults. workers.dev is off: the proxy has one address.
    // Retained on destroy: samebase.com analytics run through it.
    const posthogProxy = yield* Cloudflare.Worker("PosthogProxy", {
      name: "samebase-posthog-proxy",
      main: "apps/samebase/workers/posthog-proxy/index.ts",
      workersDev: false,
      routes: [{ pattern: "e.samebase.com/*", zoneName: "samebase.com" }],
    }).pipe(adopt(true), Alchemy.RemovalPolicy.retain());

    // The domain router: redirects registered <label>.json.md and <label>.xml.md hostnames to their
    // targets, declared in its source. Same takeover as the proxy. The CI token needs Workers Routes
    // on json.md and xml.md. This is a test outside the Samebase app, so it is not retained:
    // deleting it here deletes the Worker and its routes.
    const domains = yield* Cloudflare.Worker("Domains", {
      name: "samebase-domains",
      main: "apps/domain-router/src/index.ts",
      workersDev: false,
      routes: [
        { pattern: "*.json.md/*", zoneName: "json.md" },
        { pattern: "*.xml.md/*", zoneName: "xml.md" },
      ],
    }).pipe(adopt(true));

    return { url: site.siteUrl, posthogProxy: posthogProxy.url, domains: domains.url };
  }),
);
