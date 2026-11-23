// The services of the core (design section 4). The core is `Request -> Response` over these and
// the `Store` of src/store/Store.ts. Time comes from Effect's `Clock`. Each service carries the
// Layer that implements it; a host composes those Layers with its own `Store` Layer, and the tests
// build theirs in src/core/testing/harness.ts.
import { Config, Context, Effect, Layer, type Redacted, Schema } from "effect";
import type { GateNamespace } from "../rules/schemas.ts";
import type { Connector } from "./connectors/types.ts";
import { signInPage, type SignInPageFunction } from "./html.ts";
import { isSecureUrl } from "./protocol.ts";

/**
 * The hub's sign-in service as strangers meet it: the page before the provider, discovery and the
 * registration answer. A hub with a public registration layer needs it.
 */
export type ServiceSettings = {
  /** The name of the hub's sign-in service as users know it, such as `Samebase`. */
  readonly name: string;
  /** The terms of the hub's sign-in service: discovery's `op_tos_uri`. */
  readonly terms: string;
  /** The privacy notice of the hub's sign-in service, linked under the sign-in page. */
  readonly privacy: string;
};

/** What a host gives `HubConfig.make`. */
export type HubConfigInput = {
  /**
   * The issuer URL: https, or http on a loopback host, with no query or fragment. A dedicated
   * hostname with the issuer at `/` gets `__Host-` transaction cookies; a path issuer gets plain
   * cookies scoped to its path.
   */
  readonly issuer: string;
  /** The configured connectors, in the order discovery names them. */
  readonly connectors: ReadonlyArray<Connector>;
  readonly service?: ServiceSettings | undefined;
};

export type HubConfigShape = {
  /** The issuer with its final slash removed. */
  readonly issuer: string;
  /** The issuer's pathname with its final slash removed: `""` for an issuer at `/`. */
  readonly prefix: string;
  readonly connectors: ReadonlyArray<Connector>;
  readonly connectorsByName: ReadonlyMap<string, Connector>;
  /** The configured connector names, in order: the set that every sign-in step checks. */
  readonly configured: ReadonlyArray<string>;
  readonly service: ServiceSettings | undefined;
};

/** A host's configuration that the hub cannot run with. The message names the wrong setting. */
export class HubConfigError extends Schema.TaggedError<HubConfigError>()("HubConfigError", {
  message: Schema.String,
}) {}

export class HubConfig extends Context.Service<HubConfig, HubConfigShape>()(
  "identity-broker/core/HubConfig",
) {
  /**
   * Checks a host's configuration as `defineIdentityBroker` does, with the same messages: a wrong
   * configuration stops the host where it builds its services, not a sign-in half way.
   */
  static readonly make = Effect.fnUntraced(function* (input: HubConfigInput) {
    const issuerUrl = yield* Effect.try({
      try: () => new URL(input.issuer),
      catch: () => new HubConfigError({ message: "The issuer must be a URL" }),
    });
    if (!isSecureUrl(issuerUrl)) {
      return yield* new HubConfigError({
        message: "The issuer must be https, or http on a loopback host for local development",
      });
    }
    if (issuerUrl.search !== "" || issuerUrl.hash !== "") {
      return yield* new HubConfigError({ message: "The issuer must not have a query or fragment" });
    }
    const connectorsByName = new Map(
      input.connectors.map((connector) => [connector.name, connector]),
    );
    if (connectorsByName.size !== input.connectors.length) {
      return yield* new HubConfigError({ message: "Connector names must be unique" });
    }
    if (connectorsByName.size === 0) {
      return yield* new HubConfigError({ message: "At least one connector is required" });
    }
    // A provider is the first part of every `sub` its connectors make, so it holds no colon, and
    // its connectors sign in the accounts of one issuer: another issuer could reuse an upstream id.
    const providerIssuers = new Map<string, string>();
    for (const connector of input.connectors) {
      if (!/^[a-z0-9-]+$/.test(connector.provider)) {
        return yield* new HubConfigError({
          message: `Connector "${connector.name}" has a provider that is not [a-z0-9-]+`,
        });
      }
      const issuerOfProvider = providerIssuers.get(connector.provider) ?? connector.issuer;
      if (issuerOfProvider !== connector.issuer) {
        return yield* new HubConfigError({
          message: `The connectors of provider "${connector.provider}" have two issuers`,
        });
      }
      providerIssuers.set(connector.provider, connector.issuer);
    }
    return HubConfig.of({
      issuer: issuerUrl.href.replace(/\/$/, ""),
      prefix: issuerUrl.pathname.replace(/\/$/, ""),
      connectors: input.connectors,
      connectorsByName,
      configured: input.connectors.map((connector) => connector.name),
      service: input.service,
    });
  });

  /** The checked configuration of `input`. */
  static readonly layer = (input: HubConfigInput) => Layer.effect(HubConfig, HubConfig.make(input));
}

/**
 * The page before the provider (src/core/html.ts): a function from its facts to a whole HTML
 * document. The hub answers it with its own headers; its error pages stay the hub's own.
 */
export class SignInPage extends Context.Service<
  SignInPage,
  { readonly render: SignInPageFunction }
>()("identity-broker/core/SignInPage") {
  /** `render`, or the default page without it. */
  static readonly layer = (render: SignInPageFunction = signInPage) =>
    Layer.succeed(SignInPage, SignInPage.of({ render }));
}

/** The signing keys: the content of `IDENTITY_BROKER_KEYS`, read in the request (src/core/keys.ts). */
export class Keys extends Context.Service<
  Keys,
  { readonly read: () => Redacted.Redacted<string> | undefined }
>()("identity-broker/core/Keys") {
  /** The key set of the `IDENTITY_BROKER_KEYS` configuration value. */
  static readonly layer = Layer.effect(
    Keys,
    Effect.map(Config.Redacted("IDENTITY_BROKER_KEYS"), (keys) => Keys.of({ read: () => keys })),
  );
}

/**
 * The gate namespaces that the hub's registration layer owns, with the gates of each that the hub
 * has now. Every sign-in step reads them in its request and gives them to its command;
 * `makeHandle` provides them from the layer (src/core/router.ts).
 */
export class LiveGates extends Context.Service<
  LiveGates,
  { readonly read: Effect.Effect<ReadonlyArray<GateNamespace>> }
>()("identity-broker/core/LiveGates") {}

/** Random bytes: `crypto.getRandomValues` in production, a seeded source in tests. */
export class Random extends Context.Service<
  Random,
  { readonly bytes: (length: number) => Effect.Effect<Uint8Array> }
>()("identity-broker/core/Random") {
  static readonly layer = Layer.succeed(
    Random,
    Random.of({
      bytes: (length) =>
        Effect.sync(() => {
          const buffer = new Uint8Array(length);
          crypto.getRandomValues(buffer);
          return buffer;
        }),
    }),
  );
}

/**
 * Every outgoing HTTP request of the hub: provider discovery, token exchange, the providers' user
 * APIs, and a layer's own requests. oauth4webapi gets it as its custom fetch
 * (`oauthFetch` in src/core/connectors/upstream.ts). Tests give a stub that fails on an unplanned
 * call.
 *
 * No request of the core follows a redirect. The layer gives the mode in `fetch`'s second
 * argument: the Convex runtime's `fetch` ignores the mode of a `Request` and follows.
 */
export class Fetch extends Context.Service<
  Fetch,
  { readonly fetch: (request: Request) => Promise<Response> }
>()("identity-broker/core/Fetch") {
  static readonly layer = Layer.succeed(
    Fetch,
    Fetch.of({ fetch: (request) => fetch(request, { redirect: "manual" }) }),
  );
}
