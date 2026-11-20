// The settings of one hub, the same on every host: its issuer, the client of each provider, the
// names of its sign-in service and its page before the provider. A host gives
// `hubSettings(options)` to its runtime; the secrets are Effect `Config` values, which each host's
// configuration provider reads when the runtime builds its services. The registration layer is not
// a setting: the app's hub module gives the host the routes of the one layer it mounts.
import { Config, Effect, Layer, type Redacted } from "effect";
import { github } from "../core/connectors/github.ts";
import { google } from "../core/connectors/google.ts";
import type { SignInPageFunction } from "../core/html.ts";
import { HubConfig, SignInPage, type ServiceSettings } from "../core/services.ts";

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
  /** The names that the sign-in page shows and discovery names. */
  readonly service: ServiceSettings;
  /**
   * The hub's own page before the provider, from its facts to a whole HTML document; the default
   * page without it. The hub answers it with its own headers, and its error pages stay its own.
   */
  readonly signInPage?: SignInPageFunction;
};

/**
 * The hub's configuration and its page before the provider. A configuration that the hub cannot
 * run with stops the runtime where it builds its services: the deploy on Cloudflare, each request
 * on Convex.
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
    SignInPage.layer(options.signInPage),
  );
