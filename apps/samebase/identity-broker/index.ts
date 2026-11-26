// Samebase's identity broker (packages/identity-broker) at https://auth.samebase.com,
// which the stage `prod` of alchemy.run.ts deploys. Production, the previews of pull requests and
// the development stages register on it, each with its own key.
//
// The provider clients and the signing keys are secrets of the account's Cloudflare Secrets Store,
// each bound to the Worker by its name in the store. The three keys are the bindings that
// alchemy.run.ts makes. Each provider must list the callback of its connector or integration:
// `/connectors/<name>/callback` and `/integrations/<name>/callback`.
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Layer } from "effect";
import { identityBroker } from "@samebase/identity-broker";
import { DurableObjectStore, brokerWorkerProps } from "@samebase/identity-broker/cloudflare";
import * as Connectors from "@samebase/identity-broker/connectors";
import * as Integrations from "@samebase/identity-broker/integrations";
import * as Registration from "@samebase/identity-broker/registration";

// The logical id "Hub" and the script name stay: Alchemy's state and Cloudflare hold them.
export default class Broker extends Cloudflare.Worker<Broker>()(
  "Hub",
  {
    ...brokerWorkerProps,
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
    return yield* identityBroker({
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
      integrations: [
        Integrations.convex({
          clientId: yield* secret("SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_ID"),
          clientSecret: yield* secret("SAMEBASE_HUB_CONVEX_OAUTH_CLIENT_SECRET"),
        }),
        Integrations.cloudflare({
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
        Integrations.github({
          clientId: yield* secret("SAMEBASE_HUB_GITHUB_APP_CLIENT_ID"),
          clientSecret: yield* secret("SAMEBASE_HUB_GITHUB_APP_CLIENT_SECRET"),
        }),
      ],
      // Three keys, each for clients that may use the three integrations: a preview or development
      // client has a removal date, a production client is permanent.
      registration: Registration.keys({
        preview: {
          key: Config.Redacted("SAMEBASE_HUB_PREVIEW_KEY"),
          integrations: ["convex", "cloudflare", "github"],
        },
        development: {
          key: Config.Redacted("SAMEBASE_HUB_DEVELOPMENT_KEY"),
          integrations: ["convex", "cloudflare", "github"],
        },
        production: {
          key: Config.Redacted("SAMEBASE_HUB_PRODUCTION_KEY"),
          permanent: true,
          integrations: ["convex", "cloudflare", "github"],
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
