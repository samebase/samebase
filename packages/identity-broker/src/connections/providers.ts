// The connection providers as data: each one's endpoints, exact resource URL, scopes and client
// authentication. These providers grant API access and attest no identity. The presets are in
// index.ts; the calls to a provider are in upstream.ts.
import { Effect, type Redacted } from "effect";
import type * as oauth from "oauth4webapi";
import type { ClientSecrets } from "../core/connectors/types.ts";
import { HubConfigError, parseIssuer, parseSecureEndpoint } from "../core/services.ts";

/** One configured provider. `name` is what a card's `connections` names. */
export type ConnectionProvider = {
  readonly name: string;
  /** The exact `resource` of RFC 8707 that a client names for this provider. */
  readonly resource: string;
  readonly server: oauth.AuthorizationServer & {
    readonly authorization_endpoint: string;
    readonly token_endpoint: string;
  };
  readonly tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
  /** The scopes the hub asks for, whatever the client requests. */
  readonly scopes: ReadonlyArray<string>;
  /** Sends `prompt=select_account`: the provider shows its account picker each time. */
  readonly selectAccount: boolean;
  /** Corrects a token endpoint that departs from RFC 6749 section 5.2. */
  readonly mapTokenError?: (response: Response) => Promise<Response>;
  readonly clientId: Redacted.Redacted<string>;
  readonly clientSecret: Redacted.Redacted<string>;
};

/** A connection provider as `hub` takes it, its two secrets unread. */
export type ConnectionSpec<R = never> = Omit<ConnectionProvider, "clientId" | "clientSecret"> &
  ClientSecrets<R>;

const SAFE_NAME = /^[a-z0-9-]+$/;

/** The checks of the connections setting that need no secret. */
export const checkProviders = Effect.fnUntraced(function* (
  providers: ReadonlyArray<Pick<ConnectionProvider, "name" | "resource" | "server" | "scopes">>,
) {
  if (providers.length === 0) {
    return yield* new HubConfigError({ message: "The connections setting names no provider" });
  }
  if (new Set(providers.map((provider) => provider.name)).size !== providers.length) {
    return yield* new HubConfigError({ message: "Connection names must be unique" });
  }
  // RFC 8707 section 2: a resource is an absolute URI with no fragment.
  for (const provider of providers) {
    if (!SAFE_NAME.test(provider.name)) {
      return yield* new HubConfigError({
        message: `Connection "${provider.name}" has a name that is not [a-z0-9-]+`,
      });
    }
    const invalid = new HubConfigError({
      message: `Connection "${provider.name}" has a resource that is not an absolute URI with no fragment`,
    });
    yield* Effect.try({ try: () => new URL(provider.resource), catch: () => invalid });
    if (provider.resource.includes("#")) {
      return yield* invalid;
    }
    yield* parseIssuer(provider.server.issuer);
    yield* parseSecureEndpoint(
      provider.server.authorization_endpoint,
      `Connection "${provider.name}" authorizationEndpoint`,
    );
    yield* parseSecureEndpoint(
      provider.server.token_endpoint,
      `Connection "${provider.name}" tokenEndpoint`,
    );
    if (provider.server.revocation_endpoint !== undefined) {
      yield* parseSecureEndpoint(
        provider.server.revocation_endpoint,
        `Connection "${provider.name}" revocationEndpoint`,
      );
    }
    if (provider.scopes.some((scope) => scope.length === 0 || /\s/.test(scope))) {
      return yield* new HubConfigError({
        message: `Connection "${provider.name}" has an invalid scope`,
      });
    }
  }
  if (new Set(providers.map((provider) => provider.resource)).size !== providers.length) {
    return yield* new HubConfigError({ message: "Connection resources must be unique" });
  }
});

/**
 * The provider of `spec`, its two secrets read. A host reads them where it reads its connectors'
 * secrets, so each is a secret binding of its Worker.
 */
export const readProvider = Effect.fnUntraced(function* <R>(spec: ConnectionSpec<R>) {
  return { ...spec, clientId: yield* spec.clientId, clientSecret: yield* spec.clientSecret };
});
