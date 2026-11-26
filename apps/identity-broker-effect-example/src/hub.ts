// The app's own identity hub (packages/identity-broker), deployed by the stage `prod` of
// alchemy.run.ts. Every stage's client names its issuer (src/hub-client.ts). Google accepts only
// exact callback addresses, so the app has this one hub, at one fixed address, for all its stages.
//
// The hub registers a client for either of its two keys (the stack layer), which alchemy.run.ts
// makes and binds to this Worker as secrets: the production key may make the permanent client of
// `prod`, the preview key only clients with a removal date. The Google client and the signing keys
// (`IDENTITY_BROKER_KEYS`) are the deploying shell's variables of those names, bound to the Worker.
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import { hub, stack } from "@samebase/identity-broker";
import { DurableObjectStore, hubWorkerProps } from "@samebase/identity-broker/cloudflare";
import * as Connectors from "@samebase/identity-broker/connectors";

export default class Hub extends Cloudflare.Worker<Hub>()(
  "Hub",
  { ...hubWorkerProps, main: import.meta.url, name: "identity-broker-effect-example-hub-prod" },
  hub({
    // The script's workers.dev address. src/hub-client.ts names it too, and does not import this
    // module: the Site's bundle would carry the whole hub.
    issuer: "https://identity-broker-effect-example-hub-prod.pfp.workers.dev",
    connectors: [
      Connectors.google({
        clientId: Config.Redacted("EXAMPLE_HUB_GOOGLE_CLIENT_ID"),
        clientSecret: Config.Redacted("EXAMPLE_HUB_GOOGLE_CLIENT_SECRET"),
      }),
    ],
    registration: stack({
      keys: {
        production: { key: Config.Redacted("EXAMPLE_HUB_PRODUCTION_KEY"), permanent: true },
        preview: { key: Config.Redacted("EXAMPLE_HUB_PREVIEW_KEY") },
      },
    }),
  }).pipe(Effect.provide(DurableObjectStore)),
) {}
