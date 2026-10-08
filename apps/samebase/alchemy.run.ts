// Setup stack for Samebase: the Workers around the app. samebase.com itself
// stays with Workers Builds and apps/samebase/wrangler.jsonc. This stack
// uploads the small Workers next to it, so their routes and settings are code
// instead of Workers Builds trigger settings in the Cloudflare dashboard.
//
// .github/workflows/infra.yml runs it: a plan and a drift report on every pull
// request that touches the files it lists, a deploy on main. Run it from
// apps/samebase. Locally it needs CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in apps/samebase/.env (a token with Workers Scripts
// Edit, Workers Routes Edit and Zone Read on samebase.com, Secrets Store Edit,
// Account Settings Read):
//   npx alchemy plan --stage prod
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "Samebase",
  {
    providers: Cloudflare.providers(),
    // State lives in the Cloudflare state store of the account, so a laptop
    // and infra.yml share it.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // The PostHog reverse proxy on e.samebase.com. The name is the Worker that
    // Workers Builds deployed before this stack, so Alchemy finds it by name.
    // adopt(true) lets the first deploy take over that Worker and its route,
    // which carry no Alchemy ownership tags. The compatibility date, the
    // observability settings, and the route are the values of the Wrangler
    // config this replaces. workers.dev is off: the proxy has one address.
    // Retained on destroy: samebase.com analytics run through it.
    const posthogProxy = yield* Cloudflare.Worker("PosthogProxy", {
      name: "samebase-posthog-proxy",
      main: new URL("../posthog-proxy/src/index.ts", import.meta.url).href,
      compatibility: { date: "2026-06-29" },
      workersDev: false,
      observability: {
        enabled: true,
        headSamplingRate: 1,
        logs: { enabled: true, headSamplingRate: 1, invocationLogs: true, persist: true },
      },
      routes: [{ pattern: "e.samebase.com/*", zoneName: "samebase.com" }],
    }).pipe(adopt(true), Alchemy.RemovalPolicy.retain());

    return { posthogProxy: posthogProxy.url };
  }),
);
