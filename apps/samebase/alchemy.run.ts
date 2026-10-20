// Setup stack for Samebase. samebase.com itself is served by its production
// Convex deployment through convex-hosting and deployed by
// .github/workflows/deploy.yml; this stack owns the setup around it: the
// Convex project and the small Workers next to the app, so their routes and
// settings are code instead of settings in the Cloudflare dashboard.
//
// .github/workflows/infra.yml runs it: a plan and a drift report on every pull
// request that touches the files it lists, a deploy on main. Run it from
// apps/samebase. Locally it needs a Cloudflare login (`npx alchemy login`, or
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in apps/samebase/.env) and
// the Convex CLI login (`npx convex login`, or CONVEX_ACCESS_TOKEN). The
// Cloudflare token needs Workers Scripts Edit and Account Settings Read, plus
// Workers Routes Edit and Zone Read on samebase.com, json.md and xml.md:
//   npx alchemy plan --stage prod
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

// The team id, not the slug: CI authenticates with a team access token, and
// Convex answers the slug lookup only for a user login.
const CONVEX_TEAM = 38516;
const CONVEX_PROJECT = "samebase";

export default Alchemy.Stack(
  "Samebase",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Convex.providers()),
    // State lives in the Cloudflare state store of the account, so a laptop
    // and infra.yml share it.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // The Convex project that runs samebase.com. Found by name when it has no
    // state, then by id; adopt(true) takes over the project that existed
    // before this stack. Retained on destroy: it is the production app. The
    // deploy keys that deploy.yml and preview.yml use are repository secrets,
    // not resources of this stack.
    yield* Convex.Project("Project", {
      team: CONVEX_TEAM,
      name: CONVEX_PROJECT,
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

    return { posthogProxy: posthogProxy.url, domains: domains.url };
  }),
);
