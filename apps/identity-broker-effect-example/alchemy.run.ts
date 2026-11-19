// The Alchemy stack of the example app of the identity broker in Effect: a Worker that signs in
// with Google through the app's own hub (src/hub.ts), which only the stage `prod` deploys.
// .github/workflows/identity-broker-effect-example.yml runs it from this folder at the stage `prod`
// on a push to main, and at the stage `pr-<number>` of each pull request that changes the app or
// the broker, and destroys that stage when the pull request closes. Nothing deploys it from a
// laptop: the hub registers a client only for a GitHub Actions OIDC token.
//
// The order of one deploy, and why it takes two runs on a new stage:
//
// The hub reads `/samebase-verification.json` at the origin of the return address before it
// registers a client, so the Worker must serve that file before `IdentityHub.Client` asks. The
// client ID and secret exist only after the hub answers, and the Worker reads them as bindings. A
// Worker cannot depend on a resource that depends on the Worker, so one run cannot do both on a new
// stage. Here the client comes first and the Worker after it, and the return address needs no
// Worker output: the workers.dev URL follows from the Worker's name and the account's subdomain.
//
// - First run of a stage: no Worker yet, so the hub cannot read the file and refuses. The client
//   is not `required`, so it gives the off values (`no-hub`), and the Worker deploys with them.
//   Its page says that sign-in is not configured.
// - The workflow waits until the Worker serves the file (a new workers.dev route takes about a
//   minute), then runs the deploy again when the page has no sign-in link. The client asks again,
//   the hub reads the file and registers it, and the Worker gets the client's values.
// - Every later run: the client is renewed on the hub and the first run is enough.
//
// The other shapes need more than this Alchemy version has: no resource writes a KV value, and a
// Secrets Store secret must exist before the Worker that binds it, so a secret filled after the
// client cannot be bound in the same run. The Worker provider deletes script secrets that leave
// `env`, so a secret set beside the Worker does not last.
//
// The Worker (src/worker.ts) brings the rest: the Layers of its two services declare the hub
// client (`HubClient`) and the session secret (`SessionSecret`) and bind their values to it.
// The state is in the team's Convex store (docs/alchemy-deploy-standard.md), under the stack name
// samebase/samebase/apps/identity-broker-effect-example. A run needs CONVEX_ACCESS_TOKEN,
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, and the permission `id-token: write` for the hub.
// The stage `prod` also needs the hub's secrets: EXAMPLE_HUB_GOOGLE_CLIENT_ID,
// EXAMPLE_HUB_GOOGLE_CLIENT_SECRET and IDENTITY_BROKER_KEYS.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Hub from "./src/hub.ts";
import Site from "./src/worker.ts";

export default Alchemy.Stack(
  "samebase/samebase/apps/identity-broker-effect-example",
  {
    // Convex.providers() holds IdentityHub.Client's provider; Cloudflare.providers() holds Random's.
    providers: Layer.mergeAll(Cloudflare.providers(), Convex.providers()),
    state: Convex.withRunRecord(Convex.state()),
  },
  Effect.gen(function* () {
    // One hub for the app, so only `prod` has it. Every stage's client names its fixed issuer and
    // needs no output of it.
    const { stage } = yield* Alchemy.Stack;
    const hub = stage === "prod" ? { hub: (yield* Hub).url } : {};
    const site = yield* Site;
    return { url: site.url, ...hub };
  }),
);
