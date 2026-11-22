// The test hub, deployed at the stage `dev-spike` of alchemy.run.ts, on the GitHub layer. Its issuer
// is the workers.dev address of its script.
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import { DurableObjectStore, hubWorkerProps } from "./hosts/cloudflare/hub.ts";
import { github, hub } from "./index.ts";

export default class Hub extends Cloudflare.Worker<Hub>()(
  "Hub",
  { ...hubWorkerProps, main: import.meta.url, name: "identity-broker-effect-dev-spike" },
  hub({
    issuer: "https://identity-broker-effect-dev-spike.pfp.workers.dev",
    connectors: {
      google: {
        clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
        clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
      },
      github: {
        clientId: Config.Redacted("AUTH_GITHUB_CLIENT_ID"),
        clientSecret: Config.Redacted("AUTH_GITHUB_CLIENT_SECRET"),
      },
    },
    // samebase/samebase and the samebase organization.
    registration: github([{ repositoryId: "1021726325", ownerId: "285392744" }]),
    service: {
      name: "Samebase identity hub (Effect test)",
      terms: "https://samebase.com/terms",
      privacy: "https://samebase.com/privacy",
    },
  }).pipe(Effect.provide(DurableObjectStore)),
) {}
