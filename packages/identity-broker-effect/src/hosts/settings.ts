// The settings of one hub, the same on every host: its issuer, the client of each provider, the
// GitHub layer's allow-list and the names of its sign-in service. A host gives
// `hubSettings(options)` to its runtime; the secrets are Effect `Config` values, which each host's
// configuration provider reads when the runtime builds its services.
import { Config, Effect, Layer, type Redacted, Schema } from "effect";
import { github } from "../core/connectors/github.ts";
import { google } from "../core/connectors/google.ts";
import { HubConfig, type ServiceSettings } from "../core/services.ts";
import { AllowList } from "../layers/github/schemas.ts";
import { GithubSettings } from "../layers/github/settings.ts";

/** The allow-list as JSON text: GitHub's numeric repository id and owner id pairs. */
export const AllowedRepositories = Schema.fromJsonString(AllowList);

/** A secret of the hub. */
type Secret = Config.Config<Redacted.Redacted<string>>;

/** The client of the hub at one provider. */
type ConnectorCredentials = { readonly clientId: Secret; readonly clientSecret: Secret };

/** One hub's settings. The signing keys are the host's `IDENTITY_BROKER_KEYS` (src/core/services.ts). */
export type HubSettings = {
  /** The issuer, which each client names. Each connector's callback is under it. */
  readonly issuer: string;
  /** At least one; the hub does not start without one. */
  readonly connectors: {
    readonly google?: ConnectorCredentials;
    readonly github?: ConnectorCredentials;
  };
  /**
   * The repositories whose clients get every configured connector while the named owner owns
   * them. The owner id is checked with the repository id: a transferred repository keeps its id.
   */
  readonly allowedRepositories: typeof AllowList.Type;
  /** The names that the sign-in page shows and discovery names. */
  readonly service: ServiceSettings;
};

/**
 * The hub's configuration and the GitHub layer's settings. A configuration that the hub cannot run
 * with stops the runtime where it builds its services: the deploy on Cloudflare, each request on
 * Convex.
 */
export const hubSettings = (options: HubSettings) =>
  Layer.merge(
    Layer.unwrap(
      Effect.gen(function* () {
        const { google: googleClient, github: githubClient } = options.connectors;
        return HubConfig.layer({
          issuer: options.issuer,
          // The order of the Convex hub (apps/identity-hub/convex/broker.ts): each asks the
          // provider for its account screen on every sign-in.
          connectors: [
            ...(googleClient === undefined
              ? []
              : [
                  google({
                    clientId: yield* googleClient.clientId,
                    clientSecret: yield* googleClient.clientSecret,
                    selectAccount: true,
                  }),
                ]),
            ...(githubClient === undefined
              ? []
              : [
                  github({
                    clientId: yield* githubClient.clientId,
                    clientSecret: yield* githubClient.clientSecret,
                    selectAccount: true,
                  }),
                ]),
          ],
          service: options.service,
        }).pipe(Layer.orDie);
      }),
    ),
    GithubSettings.layer(options.allowedRepositories),
  );
