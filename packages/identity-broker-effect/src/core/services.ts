// The services of the core (design section 4). The core is `Request -> Response` over these and
// the `Store` of src/store/Store.ts. Time comes from Effect's `Clock`. A host builds each one once
// per isolate from its bindings; the tests build them in src/core/testing/harness.ts.
import { Context, Effect, type Redacted } from "effect";
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

/** What a host gives `makeHubConfig`. */
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

export class HubConfig extends Context.Service<HubConfig, HubConfigShape>()(
  "identity-broker-effect/core/HubConfig",
) {}

/**
 * Checks a host's configuration as `defineIdentityBroker` does, and throws the same errors: a
 * wrong configuration fails the isolate at its first request, not a sign-in half way.
 */
export function makeHubConfig(input: HubConfigInput): HubConfigShape {
  const issuerUrl = new URL(input.issuer);
  if (!isSecureUrl(issuerUrl)) {
    throw new Error("The issuer must be https, or http on a loopback host for local development");
  }
  if (issuerUrl.search !== "" || issuerUrl.hash !== "") {
    throw new Error("The issuer must not have a query or fragment");
  }
  const connectorsByName = new Map(
    input.connectors.map((connector) => [connector.name, connector]),
  );
  if (connectorsByName.size !== input.connectors.length) {
    throw new Error("Connector names must be unique");
  }
  if (connectorsByName.size === 0) {
    throw new Error("At least one connector is required");
  }
  // A provider is the first part of every `sub` its connectors make, so it holds no colon, and its
  // connectors sign in the accounts of one issuer: another issuer could reuse an upstream id.
  const providerIssuers = new Map<string, string>();
  for (const connector of input.connectors) {
    if (!/^[a-z0-9-]+$/.test(connector.provider)) {
      throw new Error(`Connector "${connector.name}" has a provider that is not [a-z0-9-]+`);
    }
    const issuerOfProvider = providerIssuers.get(connector.provider) ?? connector.issuer;
    if (issuerOfProvider !== connector.issuer) {
      throw new Error(`The connectors of provider "${connector.provider}" have two issuers`);
    }
    providerIssuers.set(connector.provider, connector.issuer);
  }
  return {
    issuer: issuerUrl.href.replace(/\/$/, ""),
    prefix: issuerUrl.pathname.replace(/\/$/, ""),
    connectors: input.connectors,
    connectorsByName,
    registration: input.registration,
  };
}

/** The signing keys: the content of `IDENTITY_BROKER_KEYS`, read in the request (src/core/keys.ts). */
export class Keys extends Context.Service<
  Keys,
  { readonly read: () => Redacted.Redacted<string> | undefined }
>()("identity-broker-effect/core/Keys") {}

/** Random bytes: `crypto.getRandomValues` in production, a seeded source in tests. */
export class Random extends Context.Service<
  Random,
  { readonly bytes: (length: number) => Effect.Effect<Uint8Array> }
>()("identity-broker-effect/core/Random") {
  static readonly crypto = Random.of({
    bytes: (length) =>
      Effect.sync(() => {
        const buffer = new Uint8Array(length);
        crypto.getRandomValues(buffer);
        return buffer;
      }),
  });
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
  static readonly global = Fetch.of({ fetch: (request) => fetch(request) });
}
