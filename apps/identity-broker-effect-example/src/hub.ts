// The app's own identity hub (packages/identity-broker-effect), deployed by the stage `prod` of
// alchemy.run.ts. Every stage's client names its issuer (src/hub-client.ts). Google accepts only
// exact callback addresses, so the app has this one hub, at one fixed address, for all its stages.
//
// Each secret is the deploying shell's variable of that name, bound to the Worker. The signing keys
// are its `IDENTITY_BROKER_KEYS`.
import { Config } from "effect";
import { hubWorker } from "../../../packages/identity-broker-effect/src/hosts/cloudflare/hub.ts";

export default hubWorker({
  main: import.meta.url,
  name: "identity-broker-effect-example-hub-prod",
  // The script's workers.dev address. src/hub-client.ts names it too, and does not import this
  // module: the Site's bundle would carry the whole hub.
  issuer: "https://identity-broker-effect-example-hub-prod.pfp.workers.dev",
  connectors: {
    google: {
      clientId: Config.Redacted("EXAMPLE_HUB_GOOGLE_CLIENT_ID"),
      clientSecret: Config.Redacted("EXAMPLE_HUB_GOOGLE_CLIENT_SECRET"),
    },
  },
  // samebase/samebase only.
  allowedRepositories: [{ repositoryId: "1021726325", ownerId: "285392744" }],
  service: {
    name: "Identity broker example",
    terms: "https://samebase.com/terms",
    privacy: "https://samebase.com/privacy",
  },
});
