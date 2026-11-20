// samebase.com's new identity hub (packages/identity-broker-effect) at https://auth2.samebase.com,
// which the stage `prod` of alchemy.run.ts deploys. Only the previews of pull requests register on
// it, with the preview key; production and development stay on https://auth.samebase.com.
//
// The provider clients and the signing keys (`IDENTITY_BROKER_KEYS`) are the deploying shell's
// variables of these names, bound to the Worker as secrets (.github/workflows/alchemy.yml). The
// preview key is the binding that alchemy.run.ts makes. Each provider must list the callback of
// its connector or connection: `/connectors/<name>/callback` and `/connections/<name>/callback`.
import { Config } from "effect";
import { hubWorker } from "@samebase/identity-broker-effect/cloudflare";
import { stack } from "@samebase/identity-broker-effect/stack";

export default hubWorker({
  main: import.meta.url,
  name: "samebase-identity-hub",
  // alchemy.run.ts names this issuer too, and does not take it from here.
  domain: "auth2.samebase.com",
  connectors: {
    google: {
      clientId: Config.Redacted("SAMEBASE_HUB_GOOGLE_CLIENT_ID"),
      clientSecret: Config.Redacted("SAMEBASE_HUB_GOOGLE_CLIENT_SECRET"),
    },
    github: {
      clientId: Config.Redacted("SAMEBASE_HUB_GITHUB_CLIENT_ID"),
      clientSecret: Config.Redacted("SAMEBASE_HUB_GITHUB_CLIENT_SECRET"),
    },
  },
  // The providers and scopes of auth.samebase.com (apps/identity-hub/convex/broker.ts).
  connections: {
    convex: {
      clientId: Config.Redacted("SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_ID"),
      clientSecret: Config.Redacted("SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_SECRET"),
    },
    cloudflare: {
      clientId: Config.Redacted("SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_ID"),
      clientSecret: Config.Redacted("SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_SECRET"),
      // samebase.com checks Workers Builds and Workers, reads the account name, and reads an
      // Alchemy `Cloudflare.state()` store. That read binds the store's token secret to a preview
      // Worker, and Cloudflare binds a Secrets Store secret only with Edit.
      scopes: [
        "workers-ci.read",
        "workers-ci.write",
        "workers-scripts.read",
        "workers-scripts.write",
        "account-settings.read",
        "secrets-store.read",
        "secrets-store.write",
      ],
    },
    github: {
      clientId: Config.Redacted("SAMEBASE_HUB_GITHUB_APP_CLIENT_ID"),
      clientSecret: Config.Redacted("SAMEBASE_HUB_GITHUB_APP_CLIENT_SECRET"),
    },
  },
  // One key, for previews: their clients have a removal date and may use the three connections.
  // No production key yet, so no client here is permanent.
  registration: stack({
    keys: {
      preview: {
        key: Config.Redacted("SAMEBASE_HUB_PREVIEW_KEY"),
        connections: ["convex", "cloudflare", "github"],
      },
    },
  }),
  service: {
    name: "Samebase",
    terms: "https://samebase.com/terms",
    privacy: "https://samebase.com/privacy",
  },
});
