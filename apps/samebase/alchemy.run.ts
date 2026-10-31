// The Alchemy stack of samebase.com. .github/workflows/alchemy.yml runs it from this folder:
//
// - Stage `prod`, on each push to main: the Convex project `samebase-com`, its production deployment,
//   which serves samebase.com through convex-hosting, the account API token that production sends
//   email with, and the PostHog proxy Worker of the app, so its route and settings are code instead
//   of settings in the Cloudflare dashboard.
// - Stage `pr-<number>`, on each pull request: a Convex preview deployment with the name of the
//   stage, which `alchemy destroy` deletes when the pull request closes. It reads the project by its
//   slug, so it does not depend on the state of `prod`, and it creates no Workers.
//
// The state of every stage is in the `alchemy-state-store` project of the Convex team, under the stack
// name samebase/samebase/apps/samebase, the repository and the folder of this file, where the
// repository pages of Samebase read it. Every run needs the team token CONVEX_ACCESS_TOKEN, or the Convex CLI
// login (`npx convex login`) on a laptop; it mints the deploy key of each push itself. The stage
// `prod` also needs a Cloudflare login (`npx alchemy login`, or CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in .env). That token needs Workers Scripts Edit, Account Settings Read, and
// Account API Tokens Write, plus Workers Routes Edit and Zone Read on samebase.com. The build reads
// the variables that alchemy.yml sets on each deploy step, such as VITE_SAMEBASE_ROUTE_ENVIRONMENT.
//
// Each deployment is a client of the team's identity hub, which signs in with GitHub and Google.
// Convex.HubClient registers the deployment's callback URL once, with the Convex credential of the
// run, and the deployment's `env` writes HUB_ISSUER, HUB_CLIENT_ID, and HUB_CLIENT_SECRET before the
// push, which fails without them.
//   npx alchemy plan --stage prod --no-input
import { execFileSync } from "node:child_process";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as GitHub from "@alchemy.run/github";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** The Convex team of the project and of the state. */
const team = "nicu";
/**
The site of production. Its deployment overrides CONVEX_SITE_URL to it (RFC 127), so Convex Auth
builds the hub callback on it.
*/
const PRODUCTION_SITE_URL = "https://samebase.com";
/** The identity hub's callback into Convex Auth, after CONVEX_SITE_URL (convex/convex.config.ts). */
const HUB_CALLBACK_PATH = "/auth/hub/callback";

/**
The commit of this checkout. The build puts it and its number into the app (vite.config.ts), so it is
part of the content identity of each push, as the Convex variable SAMEBASE_COMMIT: every commit
deploys, also one that changes only files outside apps/samebase, such as a workspace package.
*/
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

export default Alchemy.Stack(
  "samebase/samebase/apps/samebase",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), Convex.providers()),
    state: Convex.state({ team }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const hub = {
      team,
      app: "samebase-ahbfh",
      clientName: stage,
      softwareVersion: commit,
    };

    if (stage !== "prod") {
      // The project of samebase.com, read by its slug: this stage never creates, changes, or
      // deletes it. adopt(true) takes it into the state of this stage only.
      const project = yield* Convex.Project("Project", { team, slug: "samebase-com" }).pipe(
        adopt(true),
      );

      // A preview's hub callback is on its own `.convex.site` URL, which exists only after Convex
      // creates the deployment, and its push needs the client in `env`. A Convex.Deployment cannot
      // take an env value from its own outputs, so "Preview" creates the deployment, the client
      // registers its URL, and "Site" takes the same deployment over with adopt(true), writes the
      // variables, and pushes. Both delete it on destroy; the second delete finds it gone. adopt(true)
      // also takes over a preview with the name of this stage that an interrupted run left behind.
      const preview = yield* Convex.Deployment("Preview", {
        project,
        type: "preview",
        name: stage,
      }).pipe(adopt(true), Alchemy.RemovalPolicy.destroy());
      const client = yield* Convex.HubClient("HubClient", {
        ...hub,
        redirectUri: Output.map(preview.siteUrl, (siteUrl) => `${siteUrl}${HUB_CALLBACK_PATH}`),
        deploymentType: "preview",
      });

      // Built like production with the route environment `preview`. The push command also sets SITE_URL to the preview's site URL and seeds the password account.
      const site = yield* Convex.Deployment("Site", {
        project,
        type: "preview",
        name: stage,
        env: {
          SAMEBASE_COMMIT: commit,
          HUB_ISSUER: client.issuer,
          HUB_CLIENT_ID: client.clientId,
          HUB_CLIENT_SECRET: client.clientSecret,
        },
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
    const project = yield* Convex.Project("Project", { team, name: "samebase-com" }).pipe(
      adopt(true),
      Alchemy.RemovalPolicy.retain(),
    );

    // The production client of the identity hub, on the callback of samebase.com.
    const client = yield* Convex.HubClient("HubClient", {
      ...hub,
      redirectUri: `${PRODUCTION_SITE_URL}${HUB_CALLBACK_PATH}`,
      deploymentType: "production",
    });

    // apps/samebase/convex/email.ts sends application email with this account token, which can
    // only send email. Minting it needs Account API Tokens Write on the Cloudflare token of the
    // deploy. Cloudflare returns the value only on creation: the resource keeps it in state, and an
    // update, such as a new name or policy, keeps that value. A deploy mints a new token only when
    // this one is gone. Retained on destroy: production sends with it.
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const emailToken = yield* Cloudflare.ApiToken.AccountApiToken("EmailToken", {
      name: "samebase production email sending",
      policies: [
        {
          effect: "allow",
          permissionGroups: ["Email Sending Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
        },
      ],
    }).pipe(Alchemy.RemovalPolicy.retain());

    // The production deployment that serves samebase.com. The push runs in this folder, the app
    // with its package.json: the `deploy` script, which is the build, the upload of the site, and
    // `convex deploy`. adopt(true): the stack owns the variables in `env`, so a deploy overwrites a
    // value that was set by hand, such as the email token before the stack minted it, and a run
    // takes over a production deployment with code that is not in state, such as after a move of
    // the state. A takeover never changes or deletes the deployment.
    const site = yield* Convex.Deployment("Site", {
      project,
      type: "prod",
      env: {
        SAMEBASE_COMMIT: commit,
        HUB_ISSUER: client.issuer,
        HUB_CLIENT_ID: client.clientId,
        HUB_CLIENT_SECRET: client.clientSecret,
        CLOUDFLARE_EMAIL_ACCOUNT_ID: accountId,
        CLOUDFLARE_EMAIL_API_TOKEN: emailToken.value,
      },
      source: { path: "./convex", command: ["node", "--run", "deploy"] },
    }).pipe(adopt(true));

    // The PostHog reverse proxy on e.samebase.com, part of the Samebase app, with its code in the
    // folder of the app. The name is the Worker that Workers Builds deployed before this stack, so
    // Alchemy finds it by name. adopt(true) lets the first deploy take over that Worker and its
    // route, which carry no Alchemy ownership tags. main is relative to this folder, where this
    // stack runs.
    // Alchemy saves main in the state as written and reuses it when it repairs drift, so a file
    // URL would pin the path of the machine that deployed last. Compatibility date and
    // observability are Alchemy's defaults. workers.dev is off: the proxy has one address.
    // Retained on destroy: samebase.com analytics run through it.
    const posthogProxy = yield* Cloudflare.Worker("PosthogProxy", {
      name: "samebase-posthog-proxy",
      main: "workers/posthog-proxy/index.ts",
      workersDev: false,
      routes: [{ pattern: "e.samebase.com/*", zoneName: "samebase.com" }],
    }).pipe(adopt(true), Alchemy.RemovalPolicy.retain());

    return { url: site.siteUrl, posthogProxy: posthogProxy.url };
  }),
);
