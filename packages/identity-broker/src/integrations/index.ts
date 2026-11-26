// The API providers that a broker takes in its `integrations`, and the integrations part of a host
// that builds its own runtime.
import { Schema } from "effect";
import type { ClientSecrets } from "../core/connectors/types.ts";
import type { Integration, IntegrationSpec } from "./providers.ts";

export { makeIntegrations } from "./routes.ts";
export type { Integration, IntegrationSpec } from "./providers.ts";

/** An OAuth 2.0 server that grants access to the API at `resource`. */
export const oauth = <R1 = never, R2 = never>(
  options: ClientSecrets<R1, R2> & {
    /** What a registration key's `integrations` names, and the `<name>` of its callback. */
    readonly name: string;
    /** The exact `resource` of RFC 8707 that a client names for this provider. */
    readonly resource: string;
    /**
     * The provider's issuer identifier, which a provider that sends `iss` on its callback
     * (RFC 9207) names exactly; for a provider that names none, the origin of its token endpoint.
     */
    readonly issuer: string;
    readonly authorizationEndpoint: string;
    readonly tokenEndpoint: string;
    /** The provider's RFC 7009 endpoint, which the broker's `/revoke` calls. */
    readonly revocationEndpoint?: string;
    /** The scopes the broker asks for, whatever the client requests. Default: none. */
    readonly scopes?: ReadonlyArray<string>;
    /** Default: `client_secret_basic` (RFC 6749 section 2.3.1). */
    readonly tokenEndpointAuthMethod?: Integration["tokenEndpointAuthMethod"];
    /** Sends `prompt=select_account`. Default: off. */
    readonly selectAccount?: boolean;
    /** The provider sends `iss` on its callback (RFC 9207), which the broker then requires. */
    readonly authorizationResponseIssParameterSupported?: boolean;
    readonly mapTokenError?: Integration["mapTokenError"];
  },
): IntegrationSpec<R1 | R2> => ({
  name: options.name,
  resource: options.resource,
  server: {
    issuer: options.issuer,
    authorization_endpoint: options.authorizationEndpoint,
    token_endpoint: options.tokenEndpoint,
    ...(options.revocationEndpoint === undefined
      ? {}
      : { revocation_endpoint: options.revocationEndpoint }),
    ...(options.authorizationResponseIssParameterSupported === undefined
      ? {}
      : {
          authorization_response_iss_parameter_supported:
            options.authorizationResponseIssParameterSupported,
        }),
  },
  scopes: [...(options.scopes ?? [])],
  selectAccount: options.selectAccount ?? false,
  tokenEndpointAuthMethod: options.tokenEndpointAuthMethod ?? "client_secret_basic",
  ...(options.mapTokenError === undefined ? {} : { mapTokenError: options.mapTokenError }),
  clientId: options.clientId,
  clientSecret: options.clientSecret,
});

/** Convex's team flow grants management access; it has no scope parameter and no refresh grant. */
export const convex = <R1 = never, R2 = never>(options: ClientSecrets<R1, R2>) =>
  oauth({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    name: "convex",
    resource: "https://api.convex.dev",
    issuer: "https://api.convex.dev",
    authorizationEndpoint: "https://dashboard.convex.dev/oauth/authorize/team",
    tokenEndpoint: "https://api.convex.dev/oauth/token",
    tokenEndpointAuthMethod: "client_secret_post",
  });

/**
 * Cloudflare OAuth applications, with API permission scopes. The broker adds `offline_access`: a
 * Cloudflare access token lasts one hour, and the client needs a refresh token to go on. The
 * resource URL keeps its final slash. The revocation endpoint (RFC 7009) is the one that
 * `wrangler logout` calls. `scopes` are the Cloudflare API scopes that the broker's clients need,
 * such as `workers-scripts.write`; the broker's Cloudflare OAuth client must list each one.
 */
export const cloudflare = <R1 = never, R2 = never>(
  options: ClientSecrets<R1, R2> & { readonly scopes: ReadonlyArray<string> },
) =>
  oauth({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    name: "cloudflare",
    resource: "https://api.cloudflare.com/client/v4/",
    issuer: "https://dash.cloudflare.com",
    authorizationEndpoint: "https://dash.cloudflare.com/oauth2/auth",
    tokenEndpoint: "https://dash.cloudflare.com/oauth2/token",
    revocationEndpoint: "https://dash.cloudflare.com/oauth2/revoke",
    scopes: [...new Set([...options.scopes, "offline_access"])],
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
 * GitHub sends `iss` on its callback (RFC 9207), which the broker then requires. GitHub has no
 * revocation endpoint of RFC 7009.
 */
export const github = <R1 = never, R2 = never>(options: ClientSecrets<R1, R2>) =>
  oauth({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    name: "github",
    resource: "https://api.github.com",
    issuer: "https://github.com/login/oauth",
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    authorizationResponseIssParameterSupported: true,
    // Without the picker, GitHub authorizes the browser's current account with no question.
    selectAccount: true,
    tokenEndpointAuthMethod: "client_secret_post",
    mapTokenError: githubTokenError,
  });
