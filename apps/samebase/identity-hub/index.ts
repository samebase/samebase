// samebase.com's identity hub (packages/identity-broker) at https://auth.samebase.com,
// which the stage `prod` of alchemy.run.ts deploys. Production, the previews of pull requests and
// the development stages register on it, each with its own key.
//
// The provider clients and the signing keys are secrets of the account's Cloudflare Secrets Store,
// each bound to the Worker by its name in the store. The three keys are the bindings that
// alchemy.run.ts makes. Each provider must list the callback of its connector or connection:
// `/connectors/<name>/callback` and `/connections/<name>/callback`.
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Layer } from "effect";
import { hub, stack } from "@samebase/identity-broker";
import { DurableObjectStore, hubWorkerProps } from "@samebase/identity-broker/cloudflare";
import * as Connections from "@samebase/identity-broker/connections";
import * as Connectors from "@samebase/identity-broker/connectors";

export default class Hub extends Cloudflare.Worker<Hub>()(
  "Hub",
  {
    ...hubWorkerProps,
    main: import.meta.url,
    name: "samebase-identity-hub",
    // alchemy.run.ts names this issuer too, and does not take it from here.
    domain: "auth.samebase.com",
    workersDev: false,
  },
  Effect.gen(function* () {
    const store = Cloudflare.SecretsStore.Store.lookup({ name: "default_secrets_store" });
    const secret = (name: string) =>
      Cloudflare.SecretsStore.ReadSecret(
        Cloudflare.SecretsStore.Secret.lookup({ storeId: store.storeId, name }),
      );
    return yield* hub({
      issuer: "https://auth.samebase.com",
      keys: yield* secret("SAMEBASE_HUB_IDENTITY_BROKER_KEYS"),
      connectors: [
        Connectors.google({
          clientId: yield* secret("SAMEBASE_HUB_GOOGLE_CLIENT_ID"),
          clientSecret: yield* secret("SAMEBASE_HUB_GOOGLE_CLIENT_SECRET"),
        }),
        Connectors.github({
          clientId: yield* secret("SAMEBASE_HUB_GITHUB_CLIENT_ID"),
          clientSecret: yield* secret("SAMEBASE_HUB_GITHUB_CLIENT_SECRET"),
        }),
      ],
      connections: [
        Connections.convex({
          clientId: yield* secret("SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_ID"),
          clientSecret: yield* secret("SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_SECRET"),
        }),
        Connections.cloudflare({
          clientId: yield* secret("SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_ID"),
          clientSecret: yield* secret("SAMEBASE_HUB_CLOUDFLARE_OAUTH_CLIENT_SECRET"),
          // samebase.com checks Workers Builds and Workers, reads the account name, and reads an
          // Alchemy `Cloudflare.state()` store. That read binds the store's token secret to a
          // preview Worker, and Cloudflare binds a Secrets Store secret only with Edit.
          scopes: [
            "workers-ci.read",
            "workers-ci.write",
            "workers-scripts.read",
            "workers-scripts.write",
            "account-settings.read",
            "secrets-store.read",
            "secrets-store.write",
          ],
        }),
        Connections.github({
          clientId: yield* secret("SAMEBASE_HUB_GITHUB_APP_CLIENT_ID"),
          clientSecret: yield* secret("SAMEBASE_HUB_GITHUB_APP_CLIENT_SECRET"),
        }),
      ],
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
  }).pipe(
    Effect.provide(Layer.mergeAll(DurableObjectStore, Cloudflare.SecretsStore.ReadSecretBinding)),
  ),
) {}
