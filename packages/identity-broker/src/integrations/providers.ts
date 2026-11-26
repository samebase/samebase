// The integrations as data: each one's endpoints, exact resource URL, scopes and client
// authentication. These providers grant API access and attest no identity. The presets are in
// index.ts; the calls to a provider are in upstream.ts.
import { Effect, type Redacted } from "effect";
import type * as oauth from "oauth4webapi";
import type { ClientSecrets } from "../core/connectors/types.ts";
import { BrokerConfigError, parseHttpsUrl } from "../core/services.ts";

/** One configured API provider. `name` is what a registration key's `integrations` names. */
export type Integration = {
  readonly name: string;
  /** The exact `resource` of RFC 8707 that a client names for this provider. */
  readonly resource: string;
  readonly server: oauth.AuthorizationServer & {
    readonly authorization_endpoint: string;
    readonly token_endpoint: string;
  };
  readonly tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
  /** The scopes the broker asks for, whatever the client requests. */
  readonly scopes: ReadonlyArray<string>;
  /** Sends `prompt=select_account`: the provider shows its account picker each time. */
  readonly selectAccount: boolean;
  /** Corrects a token endpoint that departs from RFC 6749 section 5.2. */
  readonly mapTokenError?: (response: Response) => Promise<Response>;
  readonly clientId: Redacted.Redacted<string>;
  readonly clientSecret: Redacted.Redacted<string>;
};

/** An integration as `broker` takes it, its two secrets unread. */
export type IntegrationSpec<R = never> = Omit<Integration, "clientId" | "clientSecret"> &
  ClientSecrets<R>;

const SAFE_NAME = /^[a-z0-9-]+$/;
// RFC 3986 disallows whitespace and ASCII control characters inside a raw URI string.
// eslint-disable-next-line no-control-regex -- RFC 3986 URI check rejects raw ASCII controls.
const INVALID_URI_CHAR = /[\s\u0000-\u001f\u007f]/;

/** The checks of the integrations setting that need no secret. */
export const checkProviders = Effect.fnUntraced(function* (
  providers: ReadonlyArray<Pick<Integration, "name" | "resource" | "server" | "scopes">>,
) {
  if (providers.length === 0) {
    return yield* new BrokerConfigError({ message: "The integrations setting names no provider" });
  }
  if (new Set(providers.map((provider) => provider.name)).size !== providers.length) {
    return yield* new BrokerConfigError({ message: "Integration names must be unique" });
  }
  // RFC 8707 section 2: a resource is an absolute URI with no fragment.
  for (const provider of providers) {
    if (!SAFE_NAME.test(provider.name)) {
      return yield* new BrokerConfigError({
        message: `Integration "${provider.name}" has a name that is not [a-z0-9-]+`,
      });
    }
    const invalid = new BrokerConfigError({
      message: `Integration "${provider.name}" has a resource that is not an absolute URI with no fragment`,
    });
    if (provider.resource.includes("#") || INVALID_URI_CHAR.test(provider.resource)) {
      return yield* invalid;
    }
    yield* Effect.try({ try: () => new URL(provider.resource), catch: () => invalid });
    yield* parseHttpsUrl(provider.server.issuer, `Integration "${provider.name}" issuer`);
    yield* parseHttpsUrl(
      provider.server.authorization_endpoint,
      `Integration "${provider.name}" authorizationEndpoint`,
      { allowQuery: true },
    );
    yield* parseHttpsUrl(
      provider.server.token_endpoint,
      `Integration "${provider.name}" tokenEndpoint`,
      { allowQuery: true },
    );
    if (provider.server.revocation_endpoint !== undefined) {
      yield* parseHttpsUrl(
        provider.server.revocation_endpoint,
        `Integration "${provider.name}" revocationEndpoint`,
        { allowQuery: true },
      );
    }
    if (provider.scopes.some((scope) => scope.length === 0 || /\s/.test(scope))) {
      return yield* new BrokerConfigError({
        message: `Integration "${provider.name}" has an invalid scope`,
      });
    }
  }
  if (new Set(providers.map((provider) => provider.resource)).size !== providers.length) {
    return yield* new BrokerConfigError({ message: "Integration resources must be unique" });
  }
});

/**
 * The provider of `spec`, its two secrets read. A host reads them where it reads its connectors'
 * secrets, so each is a secret binding of its Worker.
 */
export const readProvider = Effect.fnUntraced(function* <R>(spec: IntegrationSpec<R>) {
  return { ...spec, clientId: yield* spec.clientId, clientSecret: yield* spec.clientSecret };
});
