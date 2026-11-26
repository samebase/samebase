// The settings of one hub, the same on every host: its issuer, the client of each provider, the
// names of its sign-in service and its page before the provider. A host gives
// `hubSettings(options)` to its runtime; the secrets are Effects, read when the runtime builds its
// services. The registration layer is not
// a setting: the app's hub module gives the host the routes of the one layer it mounts.
import { Config, Effect, Layer } from "effect";
import type { ConnectorSpec, Secret, SecretServices } from "../core/connectors/types.ts";
import type { SignInPageFunction } from "../core/html.ts";
import {
  checkConnectors,
  HubConfig,
  Keys,
  parseIssuer,
  SignInPage,
  type ServiceSettings,
} from "../core/services.ts";

/** The signing keys of a hub whose options name none. */
export const defaultKeys = Config.Redacted("IDENTITY_BROKER_KEYS");

/** The connector of `spec`, its two secrets read. */
export const readConnector = Effect.fnUntraced(function* <R>(spec: ConnectorSpec<R>) {
  return { ...spec, clientId: yield* spec.clientId, clientSecret: yield* spec.clientSecret };
});

/** One hub's settings. */
export type HubSettings<R = never> = {
  /** The issuer, which each client names. Each connector's callback is under it. */
  readonly issuer: string;
  /** At least one, in the order discovery names them; the hub does not start without one. */
  readonly connectors: ReadonlyArray<ConnectorSpec<R>>;
  /** The signing keys (src/core/keys.ts). Default: `Config.Redacted("IDENTITY_BROKER_KEYS")`. */
  readonly keys?: Secret<R>;
  /**
   * The name, terms and privacy notice that the sign-in page shows and discovery names. Without it
   * they show nothing; a public registration layer such as `github` needs it.
   */
  readonly service?: ServiceSettings;
  /**
   * The hub's own page before the provider, from its facts to a whole HTML document; the default
   * page without it. The hub answers it with its own headers, and its error pages stay its own.
   */
  readonly signInPage?: SignInPageFunction;
};

/**
 * The hub's configuration, its page before the provider and its signing keys. A configuration that
 * the hub cannot run with stops the runtime where it builds its services, before any secret is
 * read.
 */
export const hubSettings = <
  Connector extends ConnectorSpec<unknown>,
  KeySecret extends Secret<unknown> = never,
  R = SecretServices<Connector> | Effect.Services<KeySecret>,
>(
  options: {
    readonly connectors: ReadonlyArray<Connector>;
    readonly keys?: KeySecret;
  } & Omit<HubSettings<NoInfer<R>>, "connectors" | "keys">,
) => {
  // @ts-expect-error `R` holds the services of each connector's secrets, by its default.
  const connectors: ReadonlyArray<ConnectorSpec<R>> = options.connectors;
  // @ts-expect-error `R` holds the services of `keys`, by its default.
  const keys: Secret<R> = options.keys ?? defaultKeys;
  return Layer.mergeAll(
    Layer.unwrap(
      Effect.gen(function* () {
        yield* parseIssuer(options.issuer).pipe(Effect.orDie);
        yield* checkConnectors(options.connectors).pipe(Effect.orDie);
        return HubConfig.layer({
          issuer: options.issuer,
          connectors: yield* Effect.forEach(connectors, readConnector),
          service: options.service,
        }).pipe(Layer.orDie);
      }),
    ),
    SignInPage.layer(options.signInPage),
    Layer.effect(
      Keys,
      Effect.map(keys, (read) => Keys.of({ read: () => read })),
    ),
  );
};
