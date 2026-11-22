// The settings of one hub, the same on every host: its issuer, the client of each provider, the
// names of its sign-in service and its page before the provider. A host gives
// `hubSettings(options)` to its runtime; the secrets are Effects, read when the runtime builds its
// services. The registration layer is not
// a setting: the app's hub module gives the host the routes of the one layer it mounts.
import { Config, Effect, Layer, type Redacted } from "effect";
import { github } from "../core/connectors/github.ts";
import { google } from "../core/connectors/google.ts";
import type { SignInPageFunction } from "../core/html.ts";
import { HubConfig, Keys, SignInPage, type ServiceSettings } from "../core/services.ts";

/** A secret of the hub: a `Config`, or another Effect such as a Secrets Store read. */
type Secret<R> = Effect.Effect<Redacted.Redacted<string>, unknown, R>;

/** The client of the hub at one provider. */
type ConnectorCredentials<R> = { readonly clientId: Secret<R>; readonly clientSecret: Secret<R> };

/** One hub's settings. */
export type HubSettings<R = never> = {
  /** The issuer, which each client names. Each connector's callback is under it. */
  readonly issuer: string;
  /** At least one; the hub does not start without one. */
  readonly connectors: {
    readonly google?: ConnectorCredentials<R>;
    readonly github?: ConnectorCredentials<R>;
  };
  /** The signing keys (src/core/keys.ts). Default: `Config.Redacted("IDENTITY_BROKER_KEYS")`. */
  readonly keys?: Secret<R>;
  /** The names that the sign-in page shows and discovery names. */
  readonly service: ServiceSettings;
  /**
   * The hub's own page before the provider, from its facts to a whole HTML document; the default
   * page without it. The hub answers it with its own headers, and its error pages stay its own.
   */
  readonly signInPage?: SignInPageFunction;
};

/**
 * The hub's configuration, its page before the provider and its signing keys. A configuration that
 * the hub cannot run with stops the runtime where it builds its services.
 */
export const hubSettings = <R>(options: HubSettings<R>) =>
  Layer.mergeAll(
    Layer.unwrap(
      Effect.gen(function* () {
        const { google: googleClient, github: githubClient } = options.connectors;
        return HubConfig.layer({
          issuer: options.issuer,
          // Each asks the provider for its account screen on every sign-in.
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
    Layer.effect(
      Keys,
      Effect.map(options.keys ?? Config.Redacted("IDENTITY_BROKER_KEYS"), (keys) =>
        Keys.of({ read: () => keys }),
      ),
    ),
  );
