// The Alchemy stack of samebase.com, run from this folder by .github/workflows/alchemy.yml. Stages:
// `prod` on each push to main, `pr-<number>` for each pull request, `dev-<name>` at each
// `pnpm run dev` (scripts/run-worktree-dev.ts). Every run needs CONVEX_ACCESS_TOKEN or
// `npx convex login`; `prod` also needs a Cloudflare token with Workers Scripts Edit, Account
// Settings Read, Account API Tokens Write, and Workers Routes Edit and Zone Read on samebase.com.
import { execFileSync } from "node:child_process";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as GitHub from "@alchemy.run/github";
import * as Convex from "@samebase/alchemy-convex";
import * as IdentityHub from "@samebase/alchemy-convex/identity-hub";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Hub from "./identity-hub/index.ts";

/**
The site of production. Its deployment overrides CONVEX_SITE_URL to it (RFC 127), so Convex Auth
builds the hub callback on it.
*/
const PRODUCTION_SITE_URL = "https://samebase.com";
/**
The two routes of a deployment that receive the hub's answers: the identity hub's callback into
Convex Auth, after CONVEX_SITE_URL (convex/convex.config.ts), and the provider connections callback
(convex/hubResourceOAuth.ts).
*/
const callbacks = (siteUrl: string) => [
  `${siteUrl}/auth/hub/callback`,
  `${siteUrl}/oauth/hub/callback`,
];
/**
The app of this repository on the identity hub, named before the default (the stack's path,
`apps/samebase`) existed. The name groups the clients; it plays no part in user ids.
*/
const APP = "samebase";
/** The hub's connectors that the sign-in buttons name (convex/auth.ts). */
const CONNECTORS = ["google", "github"];
/**
The identity hub (identity-hub/index.ts), where every stage registers. The issuer follows from the
hub's domain there; this file names it and does not import it.
*/
const HUB = { issuer: "https://auth.samebase.com" };
/** The resource id of the hub's preview key, which `prod` makes and the previews read. */
const PREVIEW_KEY = "HubPreviewKey";
/** The resource id of the hub's development key, which `prod` makes and the development stages read. */
const DEVELOPMENT_KEY = "HubDevelopmentKey";
/** The resource id of the hub's production key, which `prod` makes. Its clients are permanent. */
const PRODUCTION_KEY = "HubProductionKey";

/**
The commit of this checkout. The build puts it and its number into the app (vite.config.ts), so it is
part of the content identity of each push, as the Convex variable SAMEBASE_COMMIT: every commit
deploys, also one that changes only files outside apps/samebase, such as a workspace package.
*/
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

export default Alchemy.Stack(
  "samebase/samebase/apps/samebase",
  {
    // The GitHub provider has no resource here: it forgets the PreviewComment rows of older previews.
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), Convex.providers()),
    state: Convex.withRunRecord(Convex.state()),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;

    if (stage.startsWith("dev-")) {
      // A development checkout: the logged-in local deployment of this folder, which `convex dev`
      // runs and pushes. `pnpm run dev` runs this stage once the backend answers. The client is a
      // development client on the backend's site port, which stays fixed for the folder, and it
      // asks the hub with the development key from the state of `prod`. The hub removes it 14 days
      // after its last run. "Site" only writes the three variables.
      const local = Convex.LocalDeployment.of();
      const hub = IdentityHub.Client.variables(
        yield* IdentityHub.Client("HubClient", {
          app: APP,
          hub: HUB,
          connectors: CONNECTORS,
          redirectUris: callbacks(local.siteUrl),
          deploymentType: "development",
          key: yield* IdentityHub.registrationKey(DEVELOPMENT_KEY, { stage: "prod" }),
          softwareVersion: commit,
          required: true,
        }),
      );
      const site = yield* Convex.LocalDeployment("Site", {
        env: {
          IDENTITY_HUB_ISSUER: hub.issuer,
          IDENTITY_HUB_CLIENT_ID: hub.clientId,
          IDENTITY_HUB_CLIENT_SECRET: hub.clientSecret,
        },
      });

      return { url: site.siteUrl };
    }

    if (stage !== "prod") {
      // The project of samebase.com, read by its slug: this stage never creates, changes, or
      // deletes it. adopt(true) takes it into the state of this stage only.
      const project = yield* Convex.Project("Project", { slug: "samebase-com" }).pipe(adopt(true));

      // A preview's hub callbacks are on its own `.convex.site` URL, and the hub reads the
      // verification file there before it registers a client, so the preview has code first.
      // "Preview" creates the deployment and pushes: built like production with the route
      // environment `preview`, and the push command also sets SITE_URL to the preview's site URL and,
      // once per preview, seeds the account. Its first push takes the off values of the three hub variables
      // from the project's default variables for previews. Then the client registers, and "Site"
      // writes its variables, with no push. Each variable keeps the row that owned it before:
      // a row removes a name that leaves its own `env`. Both rows delete the deployment on destroy;
      // the second delete finds it gone. adopt(true) also takes over a preview with the name of this
      // stage that an interrupted run left behind. The client is not `required`: before `prod` made
      // the preview key, it gives the off values.
      const preview = yield* Convex.Deployment("Preview", {
        project,
        type: "preview",
        name: stage,
        env: { SAMEBASE_COMMIT: commit },
        source: { path: "./convex", command: ["node", "./scripts/deploy-preview.ts"] },
      }).pipe(adopt(true), Alchemy.RemovalPolicy.destroy());
      const hub = IdentityHub.Client.variables(
        yield* IdentityHub.Client("HubClient", {
          app: APP,
          hub: HUB,
          connectors: CONNECTORS,
          redirectUris: Output.map(preview.siteUrl, callbacks),
          deploymentType: "preview",
          key: yield* IdentityHub.registrationKey(PREVIEW_KEY, { stage: "prod" }),
          softwareVersion: commit,
        }),
      );
      const site = yield* Convex.Deployment("Site", {
        project,
        type: "preview",
        name: stage,
        env: {
          SAMEBASE_COMMIT: commit,
          IDENTITY_HUB_ISSUER: hub.issuer,
          IDENTITY_HUB_CLIENT_ID: hub.clientId,
          IDENTITY_HUB_CLIENT_SECRET: hub.clientSecret,
        },
      }).pipe(adopt(true), Alchemy.RemovalPolicy.destroy());

      return { url: site.siteUrl };
    }

    // The Convex project that runs samebase.com. Found by name when it has no state, then by id;
    // adopt(true) takes over the project that existed before this stack. Retained on destroy: it is
    // the production app.
    const project = yield* Convex.Project("Project", { name: "samebase-com" }).pipe(
      adopt(true),
      Alchemy.RemovalPolicy.retain(),
    );

    // The production client, on the callbacks of samebase.com. It registers
    // before "Site" pushes, and "Site" keeps every variable it owned before. The production key
    // makes it permanent.
    const productionKey = yield* IdentityHub.registrationKey(PRODUCTION_KEY, { stage: "prod" });
    const hub = IdentityHub.Client.variables(
      yield* IdentityHub.Client("Hub2Client", {
        app: APP,
        hub: HUB,
        connectors: CONNECTORS,
        redirectUris: callbacks(PRODUCTION_SITE_URL),
        deploymentType: "production",
        key: productionKey,
        softwareVersion: commit,
        required: true,
      }),
    );

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
        IDENTITY_HUB_ISSUER: hub.issuer,
        IDENTITY_HUB_CLIENT_ID: hub.clientId,
        IDENTITY_HUB_CLIENT_SECRET: hub.clientSecret,
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

    // The hub and its keys: the preview and development keys, which the other stages read from
    // this stage's state, and the production key. The hub binds its other secrets from the
    // account's Secrets Store itself (identity-hub/index.ts).
    const hubWorker = yield* Hub;
    yield* hubWorker.bind("RegistrationKeys", {
      env: {
        SAMEBASE_HUB_PREVIEW_KEY: yield* IdentityHub.registrationKey(PREVIEW_KEY, {
          stage: "prod",
        }),
        SAMEBASE_HUB_DEVELOPMENT_KEY: yield* IdentityHub.registrationKey(DEVELOPMENT_KEY, {
          stage: "prod",
        }),
        SAMEBASE_HUB_PRODUCTION_KEY: productionKey,
      },
    });

    return { url: site.siteUrl, posthogProxy: posthogProxy.url };
  }),
);
