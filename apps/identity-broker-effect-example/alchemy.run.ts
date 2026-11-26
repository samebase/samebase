// The Alchemy stack of the example app of the identity broker in Effect: a Worker that signs in
// with Google through the app's own hub (src/hub.ts), which only the stage `prod` deploys.
// .github/workflows/identity-broker-effect-example.yml runs it from this folder at the stage `prod`
// on a push to main, and at the stage `pr-<number>` of each pull request that changes the app or
// the broker, and destroys that stage when the pull request closes.
//
// The hub is on the stack layer: it registers a client that presents one of its two keys, which
// the stage `prod` makes. One run of a stage is enough:
//
// - `prod`: the run makes the two keys (`Alchemy.Random`, kept in state), deploys the hub with
//   both as secrets, and registers the app's production client with the production key. The client
//   waits until the hub answers discovery (a new workers.dev route takes about a minute), then the
//   Worker deploys with the client's values.
// - Every other stage reads the preview key from the state of `prod` and registers a preview
//   client, which the hub removes 14 days after its last sign-in or renewal. A stage that runs
//   before `prod` made the keys has no key: its client gives the off values (`broker-disabled`), and the
//   page says that sign-in is not configured until the stage deploys again.
// - Every later run renews the client on the hub with the client's own token.
//
// The return address needs no Worker output: the workers.dev URL follows from the Worker's name
// and the account's subdomain, so the client comes first and the Worker after it.
//
// The Worker (src/worker.ts) brings the rest: the Layers of its two services declare the hub
// client (`HubClient`) and the session secret (`SessionSecret`) and bind their values to it.
// The state is in the team's Convex store (docs/alchemy-deploy-standard.md), under the stack name
// samebase/samebase/apps/identity-broker-effect-example. A run needs CONVEX_ACCESS_TOKEN,
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. The stage `prod` also needs the hub's secrets:
// EXAMPLE_HUB_GOOGLE_CLIENT_ID, EXAMPLE_HUB_GOOGLE_CLIENT_SECRET and IDENTITY_BROKER_KEYS.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Convex from "@samebase/alchemy-convex";
import * as IdentityBroker from "@samebase/identity-broker/alchemy";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HUB_KEYS } from "./src/hub-client.ts";
import Hub from "./src/hub.ts";
import Site from "./src/worker.ts";

export default Alchemy.Stack(
  "samebase/samebase/apps/identity-broker-effect-example",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      Convex.providers(),
      IdentityBroker.providers(),
    ),
    state: Convex.withRunRecord(Convex.state()),
  },
  Effect.gen(function* () {
    // One hub for the app, so only `prod` has it. Every stage's client names its fixed issuer and
    // needs no output of it.
    const { stage } = yield* Alchemy.Stack;
    if (stage !== "prod") {
      return { url: (yield* Site).url };
    }
    const hub = yield* Hub;
    // Two keys, so each kind of deploy has its own sign-in limit, its own switch (a stop of
    // `stack:<name>`, or the key's removal from src/hub.ts) and its own rule on permanent
    // clients. Both are rows of the same state store, so a run that holds the team's deploy
    // credentials can read both: they are not a wall against such a run.
    yield* hub.bind("RegistrationKeys", {
      env: {
        EXAMPLE_HUB_PRODUCTION_KEY: yield* IdentityBroker.registrationKey(HUB_KEYS.production, {
          stage: "prod",
        }),
        EXAMPLE_HUB_PREVIEW_KEY: yield* IdentityBroker.registrationKey(HUB_KEYS.preview, {
          stage: "prod",
        }),
      },
    });
    const site = yield* Site;
    return { url: site.url, hub: hub.url };
  }),
);
