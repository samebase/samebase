// The settings of one hub, the same on every host: its issuer, the client of each provider, the
// allow-list policy and the names that registration answers. A host gives `hubSettings(options)`
// to its runtime; the secrets are Effect `Config` values, which each host's configuration provider
// reads when the runtime builds its services.
import { Config, Effect, Layer, type Redacted, Schema } from "effect";
import { github } from "../core/connectors/github.ts";
import { google } from "../core/connectors/google.ts";
import type { PolicyFunction } from "../core/policy.ts";
import { HubConfig, type RegistrationSettings } from "../core/services.ts";

/** The allow-list: GitHub's numeric repository id and owner id pairs, as JSON. */
export const AllowedRepositories = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ repositoryId: Schema.String, ownerId: Schema.String })),
);

/**
 * A repository of the list gets both connectors, every other repository gets none, and nothing is
 * paused. The owner id is checked with the repository id: a transferred repository keeps its id.
 */
export function allowListPolicy(allowed: typeof AllowedRepositories.Type): PolicyFunction {
  return (registration) => {
    const listed = allowed.some(
      (entry) =>
        entry.repositoryId === registration.repositoryId && entry.ownerId === registration.ownerId,
    );
    return { connectors: listed ? ["google", "github"] : [], resources: [], paused: false };
  };
}

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
  /** The repositories that get the connectors (`allowListPolicy`). */
  readonly allowedRepositories: typeof AllowedRepositories.Type;
  /** The names that registration answers and the sign-in page show. */
  readonly registration: Omit<RegistrationSettings, "policy">;
};

/**
 * The hub's configuration. A configuration that the hub cannot run with stops the runtime where it
 * builds its services: the deploy on Cloudflare, each request on Convex.
 */
export const hubSettings = (options: HubSettings) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const { google: googleClient, github: githubClient } = options.connectors;
      return HubConfig.layer({
        issuer: options.issuer,
        // The order of the Convex hub (apps/identity-hub/convex/broker.ts): each asks the provider
        // for its account screen on every sign-in.
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
        registration: {
          ...options.registration,
          policy: allowListPolicy(options.allowedRepositories),
        },
      }).pipe(Layer.orDie);
    }),
  );
