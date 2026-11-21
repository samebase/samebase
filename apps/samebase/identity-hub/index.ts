// samebase.com's identity hub (packages/identity-broker-effect) at https://auth2.samebase.com,
// which the stage `prod` of alchemy.run.ts deploys. Production, the previews of pull requests and
// the development stages register on it, each with its own key.
//
// The provider clients and the signing keys are secrets of the account's Cloudflare Secrets Store,
// bound to the Worker by name (`secretsStore` below). The three keys are the bindings that
// alchemy.run.ts makes. Each provider must list the callback of its connector or connection:
// `/connectors/<name>/callback` and `/connections/<name>/callback`.
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
  // Each name the hub reads, and its secret in the store. The hub reads its signing keys as
  // `IDENTITY_BROKER_KEYS`.
  secretsStore: {
    store: "default_secrets_store",
    secrets: {
      SAMEBASE_HUB_GOOGLE_CLIENT_ID: "SAMEBASE_HUB_GOOGLE_CLIENT_ID",
      SAMEBASE_HUB_GOOGLE_CLIENT_SECRET: "SAMEBASE_HUB_GOOGLE_CLIENT_SECRET",
      SAMEBASE_HUB_GITHUB_CLIENT_ID: "SAMEBASE_HUB_GITHUB_CLIENT_ID",
      SAMEBASE_HUB_GITHUB_CLIENT_SECRET: "SAMEBASE_HUB_GITHUB_CLIENT_SECRET",
      SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_ID: "SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_ID",
      SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_SECRET: "SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_SECRET",
      SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_ID: "SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_ID",
      SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_SECRET: "SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_SECRET",
      SAMEBASE_HUB_GITHUB_APP_CLIENT_ID: "SAMEBASE_HUB_GITHUB_APP_CLIENT_ID",
      SAMEBASE_HUB_GITHUB_APP_CLIENT_SECRET: "SAMEBASE_HUB_GITHUB_APP_CLIENT_SECRET",
      IDENTITY_BROKER_KEYS: "SAMEBASE_HUB_IDENTITY_BROKER_KEYS",
    },
  },
  // Three keys, each for clients that may use the three connections: a preview or development
  // client has a removal date, a production client is permanent.
  registration: stack({
    keys: {
      preview: {
        key: Config.Redacted("SAMEBASE_HUB_PREVIEW_KEY"),
        connections: ["convex", "cloudflare", "github"],
      },
      development: {
        key: Config.Redacted("SAMEBASE_HUB_DEVELOPMENT_KEY"),
        connections: ["convex", "cloudflare", "github"],
      },
      production: {
        key: Config.Redacted("SAMEBASE_HUB_PRODUCTION_KEY"),
        permanent: true,
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
