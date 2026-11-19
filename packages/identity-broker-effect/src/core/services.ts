// The services of the core (design section 4). The core is `Request -> Response` over these and
// the `Store` of src/store/Store.ts. Time comes from Effect's `Clock`. Each service carries the
// Layer that implements it; a host composes those Layers with its own `Store` Layer, and the tests
// build theirs in src/core/testing/harness.ts.
import { Config, Context, Effect, Layer, type Redacted, Schema } from "effect";
import type { Connector } from "./connectors/types.ts";
import type { PolicyFunction } from "./policy.ts";
import { isSecureUrl } from "./protocol.ts";

/**
 * The hub mode: `POST /register` (RFC 7591) and `/register/<client>` (RFC 7592), and the policy.
 * Absent: none of these endpoints, and the host is its own policy.
 */
export type RegistrationSettings = {
  /**
   * What a registration may do, decided from its facts: the connectors it may enroll in and use,
   * and whether it is paused. Run at registration and at each use. A policy that throws or answers
   * a malformed value refuses the request (`evaluate` in src/core/policy.ts).
   */
  readonly policy: PolicyFunction;
  /** The name of the hub's sign-in service as users know it, such as `Samebase`. */
  readonly name: string;
  /** The terms of the hub's sign-in service: every new client's answer names them. */
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
  /** The connectors a client may enroll in, in the order discovery names them. */
  readonly connectors: ReadonlyArray<Connector>;
  readonly registration: RegistrationSettings | undefined;
};

export type HubConfigShape = {
  /** The issuer with its final slash removed. */
  readonly issuer: string;
  /** The issuer's pathname with its final slash removed: `""` for an issuer at `/`. */
  readonly prefix: string;
  readonly connectors: ReadonlyArray<Connector>;
  readonly connectorsByName: ReadonlyMap<string, Connector>;
  readonly registration: RegistrationSettings | undefined;
};

/** A host's configuration that the hub cannot run with. The message names the wrong setting. */
export class HubConfigError extends Schema.TaggedError<HubConfigError>()("HubConfigError", {
  message: Schema.String,
}) {}

export class HubConfig extends Context.Service<HubConfig, HubConfigShape>()(
  "identity-broker-effect/core/HubConfig",
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
      registration: input.registration,
    });
  });

  /** The checked configuration of `input`. */
  static readonly layer = (input: HubConfigInput) => Layer.effect(HubConfig, HubConfig.make(input));
}

/** The signing keys: the content of `IDENTITY_BROKER_KEYS`, read in the request (src/core/keys.ts). */
export class Keys extends Context.Service<
  Keys,
  { readonly read: () => Redacted.Redacted<string> | undefined }
>()("identity-broker-effect/core/Keys") {
  /** The key set of the `IDENTITY_BROKER_KEYS` configuration value. */
  static readonly layer = Layer.effect(
    Keys,
    Effect.map(Config.Redacted("IDENTITY_BROKER_KEYS"), (keys) => Keys.of({ read: () => keys })),
  );
}

/** Random bytes: `crypto.getRandomValues` in production, a seeded source in tests. */
export class Random extends Context.Service<
  Random,
  { readonly bytes: (length: number) => Effect.Effect<Uint8Array> }
>()("identity-broker-effect/core/Random") {
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
 * Every outgoing HTTP request of the core: provider discovery, token exchange, the GitHub API, the
 * GitHub Actions keys and the verification files. oauth4webapi gets it as its custom fetch
 * (`oauthFetch` in src/core/connectors/upstream.ts). Tests give a stub that fails on an unplanned
 * call.
 */
export class Fetch extends Context.Service<
  Fetch,
  { readonly fetch: (request: Request) => Promise<Response> }
>()("identity-broker-effect/core/Fetch") {
  static readonly layer = Layer.succeed(Fetch, Fetch.of({ fetch: (request) => fetch(request) }));
}
