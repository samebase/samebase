// The connection providers as data: each one's endpoints, exact resource URL, scopes and client
// authentication, as the Convex broker defines them (packages/identity-broker/src/client/
// resourceProviders.ts). These providers grant API access and attest no identity. The calls to a
// provider are in upstream.ts.
import { Config, Effect, Redacted, Schema } from "effect";
import type * as oauth from "oauth4webapi";

/** A secret of the hub. */
type Secret = Config.Config<Redacted.Redacted<string>>;

/** The client of the hub at one provider, as `Config` reads of the host's secrets. */
export type ProviderCredentials = { readonly clientId: Secret; readonly clientSecret: Secret };

/** The connection providers of one hub. A hub with none of them has no connections part. */
export type ConnectionSettings = {
  readonly convex?: ProviderCredentials;
  /**
   * `scopes` are the Cloudflare API scopes that the hub's clients need, such as
   * `workers-scripts.write`; the hub's Cloudflare OAuth client must list each one.
   */
  readonly cloudflare?: ProviderCredentials & { readonly scopes: ReadonlyArray<string> };
  readonly github?: ProviderCredentials;
};

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

type Credentials = Pick<ConnectionProvider, "clientId" | "clientSecret">;

/** Convex's team flow grants management access; it has no scope parameter and no refresh grant. */
export const convexConnection = (credentials: Credentials): ConnectionProvider => ({
  ...credentials,
  name: "convex",
  resource: "https://api.convex.dev",
  server: {
    issuer: "https://api.convex.dev",
    authorization_endpoint: "https://dashboard.convex.dev/oauth/authorize/team",
    token_endpoint: "https://api.convex.dev/oauth/token",
  },
  scopes: [],
  selectAccount: false,
  tokenEndpointAuthMethod: "client_secret_post",
});

/**
 * Cloudflare OAuth applications, with API permission scopes. The hub adds `offline_access`: a
 * Cloudflare access token lasts one hour, and the client needs a refresh token to go on. The
 * resource URL keeps its final slash. The revocation endpoint (RFC 7009) is the one that
 * `wrangler logout` calls.
 */
export const cloudflareConnection = (
  options: Credentials & { readonly scopes: ReadonlyArray<string> },
): ConnectionProvider => ({
  clientId: options.clientId,
  clientSecret: options.clientSecret,
  name: "cloudflare",
  resource: "https://api.cloudflare.com/client/v4/",
  server: {
    issuer: "https://dash.cloudflare.com",
    authorization_endpoint: "https://dash.cloudflare.com/oauth2/auth",
    token_endpoint: "https://dash.cloudflare.com/oauth2/token",
    revocation_endpoint: "https://dash.cloudflare.com/oauth2/revoke",
  },
  scopes: [...new Set([...options.scopes, "offline_access"])],
  selectAccount: false,
  tokenEndpointAuthMethod: "client_secret_basic",
});

const isTokenError = Schema.is(Schema.Struct({ error: Schema.String }));

/**
 * GitHub answers a token error with HTTP 200, where RFC 6749 section 5.2 requires 400, and it
 * names `invalid_grant` `bad_refresh_token` on refresh.
 */
const githubTokenError = async (response: Response) => {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (!isTokenError(body)) {
    return response;
  }
  return Response.json(
    { error: body.error === "bad_refresh_token" ? "invalid_grant" : body.error },
    { status: 400 },
  );
};

/**
 * The user access tokens of a GitHub App: the App's permissions set their access, not a scope.
 * GitHub sends `iss` on its callback (RFC 9207), which the hub then requires. GitHub has no
 * revocation endpoint of RFC 7009.
 */
export const githubConnection = (credentials: Credentials): ConnectionProvider => ({
  ...credentials,
  name: "github",
  resource: "https://api.github.com",
  server: {
    issuer: "https://github.com/login/oauth",
    authorization_endpoint: "https://github.com/login/oauth/authorize",
    token_endpoint: "https://github.com/login/oauth/access_token",
    authorization_response_iss_parameter_supported: true,
  },
  scopes: [],
  // Without the picker, GitHub authorizes the browser's current account with no question.
  selectAccount: true,
  tokenEndpointAuthMethod: "client_secret_post",
  mapTokenError: githubTokenError,
});

/**
 * The providers of `settings`, with their secrets read. A host reads them where it reads its
 * connectors' secrets, so each is a secret binding of its Worker.
 */
export const readProviders = Effect.fnUntraced(function* (settings: ConnectionSettings) {
  const providers: ConnectionProvider[] = [];
  if (settings.convex !== undefined) {
    providers.push(
      convexConnection({
        clientId: yield* settings.convex.clientId,
        clientSecret: yield* settings.convex.clientSecret,
      }),
    );
  }
  if (settings.cloudflare !== undefined) {
    providers.push(
      cloudflareConnection({
        clientId: yield* settings.cloudflare.clientId,
        clientSecret: yield* settings.cloudflare.clientSecret,
        scopes: settings.cloudflare.scopes,
      }),
    );
  }
  if (settings.github !== undefined) {
    providers.push(
      githubConnection({
        clientId: yield* settings.github.clientId,
        clientSecret: yield* settings.github.clientSecret,
      }),
    );
  }
  return providers;
});
