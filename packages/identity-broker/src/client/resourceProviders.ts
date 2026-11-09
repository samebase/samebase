import * as oauth from "oauth4webapi";
import { asRecord } from "./protocol.js";

type Credentials = { clientId: () => string; clientSecret: () => string };

/** A configured OAuth API resource. These providers grant API access without attesting an identity. */
/** `Name` is the provider's name as a literal type, so a hub's policy can only name its own. */
export type ResourceProvider<Name extends string = string> = Credentials & {
  name: Name;
  resource: string;
  server: oauth.AuthorizationServer & { authorization_endpoint: string };
  tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
  scopes: readonly string[];
  /**
   * Sends `prompt=select_account`, so the provider shows its account picker on each authorization
   * instead of reusing the account the browser is signed in to.
   */
  selectAccount: boolean;
  /** Corrects a token endpoint that departs from RFC 6749 section 5.2. */
  normalizeTokenResponse?: (response: Response) => Promise<Response>;
};

/** Below the lease in `resourceRequests`, so an attempt ends before another can claim its grant. */
const REFRESH_TIMEOUT_MS = 30 * 1000;

/** Convex's team flow grants management access; it has no OAuth scope parameter or refresh grant. */
export function convexConnection(credentials: Credentials): ResourceProvider<"convex"> {
  return {
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
  };
}

/** Cloudflare OAuth Applications, using API permission scopes and its documented token endpoint. */
export function cloudflareConnection(credentials: Credentials): ResourceProvider<"cloudflare"> {
  return {
    ...credentials,
    name: "cloudflare",
    resource: "https://api.cloudflare.com/client/v4/",
    server: {
      issuer: "https://dash.cloudflare.com",
      authorization_endpoint: "https://dash.cloudflare.com/oauth2/auth",
      token_endpoint: "https://dash.cloudflare.com/oauth2/token",
    },
    scopes: [
      "workers-ci.read",
      "workers-ci.write",
      "workers-scripts.read",
      "workers-scripts.write",
      "account-settings.read",
      "offline_access",
    ],
    selectAccount: false,
    tokenEndpointAuthMethod: "client_secret_basic",
  };
}

/**
 * GitHub answers a token error with HTTP 200, where RFC 6749 section 5.2 requires 400, and it names
 * `invalid_grant` `bad_refresh_token` on refresh.
 */
async function githubTokenResponse(response: Response) {
  const error = asRecord(
    await response
      .clone()
      .json()
      .catch(() => null),
  )["error"];
  if (typeof error !== "string") return response;
  return Response.json(
    { error: error === "bad_refresh_token" ? "invalid_grant" : error },
    { status: 400 },
  );
}

/** The user access tokens of a GitHub App. The App's permissions set their access, not a scope. */
export function githubConnection(credentials: Credentials): ResourceProvider<"github"> {
  return {
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
    normalizeTokenResponse: githubTokenResponse,
  };
}

export async function startResourceAuthorization(args: {
  provider: ResourceProvider;
  callbackUrl: string;
}) {
  const url = new URL(args.provider.server.authorization_endpoint);
  const state = oauth.generateRandomState();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  url.searchParams.set("client_id", args.provider.clientId());
  url.searchParams.set("redirect_uri", args.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (args.provider.scopes.length > 0)
    url.searchParams.set("scope", args.provider.scopes.join(" "));
  if (args.provider.selectAccount) url.searchParams.set("prompt", "select_account");
  return { url: url.toString(), state, codeVerifier };
}

function clientAuthentication(provider: ResourceProvider) {
  return provider.tokenEndpointAuthMethod === "client_secret_basic"
    ? oauth.ClientSecretBasic(provider.clientSecret())
    : oauth.ClientSecretPost(provider.clientSecret());
}

function resourceTokens(tokens: oauth.TokenEndpointResponse, omittedScope: string) {
  return {
    accessToken: tokens.access_token,
    scope: tokens.scope ?? omittedScope,
    ...(tokens.expires_in === undefined
      ? {}
      : { expiresAt: Date.now() + tokens.expires_in * 1000 }),
    ...(tokens.refresh_token === undefined ? {} : { refreshToken: tokens.refresh_token }),
  };
}

export async function finishResourceAuthorization(args: {
  provider: ResourceProvider;
  callbackUrl: string;
  currentUrl: URL;
  state: string;
  codeVerifier: string;
}) {
  const { provider } = args;
  const client: oauth.Client = { client_id: provider.clientId() };
  const params = oauth.validateAuthResponse(provider.server, client, args.currentUrl, args.state);
  const response = await oauth.authorizationCodeGrantRequest(
    provider.server,
    client,
    clientAuthentication(provider),
    params,
    args.callbackUrl,
    args.codeVerifier,
  );
  return resourceTokens(
    await oauth.processAuthorizationCodeResponse(
      provider.server,
      client,
      await (provider.normalizeTokenResponse?.(response) ?? response),
    ),
    provider.scopes.join(" "),
  );
}

export async function refreshResourceToken(args: {
  provider: ResourceProvider;
  refreshToken: string;
}) {
  const { provider } = args;
  const client: oauth.Client = { client_id: provider.clientId() };
  const response = await oauth.refreshTokenGrantRequest(
    provider.server,
    client,
    clientAuthentication(provider),
    args.refreshToken,
    { signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) },
  );
  // RFC 6749 section 6: an omitted scope on refresh means the original grant, so it stays omitted.
  return resourceTokens(
    await oauth.processRefreshTokenResponse(
      provider.server,
      client,
      await (provider.normalizeTokenResponse?.(response) ?? response),
    ),
    "",
  );
}
