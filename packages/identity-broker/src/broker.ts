// The test broker, deployed at the stage `dev-spike` of alchemy.run.ts, on the GitHub layer. Its
// issuer is the workers.dev address of its script.
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import * as Connectors from "./core/connectors/index.ts";
import { DurableObjectStore, brokerWorkerProps } from "./hosts/cloudflare/broker.ts";
import { identityBroker } from "./index.ts";
import { github } from "./layers/github/routes.ts";

export default class Broker extends Cloudflare.Worker<Broker>()(
  // The Alchemy logical id that the stage's saved state holds.
  "Hub",
  { ...brokerWorkerProps, main: import.meta.url, name: "identity-broker-effect-dev-spike" },
  identityBroker({
    issuer: "https://identity-broker-effect-dev-spike.pfp.workers.dev",
    connectors: [
      Connectors.google({
        clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
        clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
      }),
      Connectors.github({
        clientId: Config.Redacted("AUTH_GITHUB_CLIENT_ID"),
        clientSecret: Config.Redacted("AUTH_GITHUB_CLIENT_SECRET"),
      }),
    ],
    // samebase/samebase and the samebase organization.
    registration: github([{ repositoryId: "1021726325", ownerId: "285392744" }]),
    service: {
      name: "Samebase identity broker (Effect test)",
      terms: "https://samebase.com/terms",
      privacy: "https://samebase.com/privacy",
    },
  }).pipe(Effect.provide(DurableObjectStore)),
) {}
