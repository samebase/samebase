// The hub's calls to a connection provider: the authorization URL with the hub's own state and
// PKCE (RFC 7636), the code exchange (RFC 6749 section 4.1.3) and the refresh (section 6). Every
// request goes through the core's `Fetch`. Errors propagate; the handler decides what they mean.
import { Redacted } from "effect";
import * as oauth from "oauth4webapi";
import { oauthFetch, type FetchFunction } from "../core/connectors/upstream.ts";
import type { ConnectionProvider } from "./providers.ts";
import type { ProviderTokens } from "./tables.ts";

/**
 * The provider call of a refresh ends after this time. It is below the lease of
 * `REFRESH_LEASE_MS` (rules.ts), so an attempt ends before another can take its grant.
 */
export const REFRESH_TIMEOUT_MS = 30 * 1000;

type Tokens = typeof ProviderTokens.Type;

/** The authorization URL for `provider`, with fresh state and PKCE pair of the hub's own. */
export async function startConnection(provider: ConnectionProvider, callbackUrl: string) {
  const url = new URL(provider.server.authorization_endpoint);
  const state = oauth.generateRandomState();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  url.searchParams.set("client_id", Redacted.value(provider.clientId));
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (provider.scopes.length > 0) {
    url.searchParams.set("scope", provider.scopes.join(" "));
  }
  if (provider.selectAccount) {
    url.searchParams.set("prompt", "select_account");
  }
  return { url: url.toString(), state, codeVerifier };
}

const clientAuthentication = (provider: ConnectionProvider) =>
  provider.tokenEndpointAuthMethod === "client_secret_basic"
    ? oauth.ClientSecretBasic(Redacted.value(provider.clientSecret))
    : oauth.ClientSecretPost(Redacted.value(provider.clientSecret));

const tokensOf = (
  tokens: oauth.TokenEndpointResponse,
  omittedScope: string,
  now: number,
): Tokens => ({
  accessToken: tokens.access_token,
  scope: tokens.scope ?? omittedScope,
  ...(tokens.expires_in === undefined ? {} : { expiresAt: now + tokens.expires_in * 1000 }),
  ...(tokens.refresh_token === undefined ? {} : { refreshToken: tokens.refresh_token }),
});

/**
 * The provider's callback: validates it (with `iss` when the provider sends one, RFC 9207) and
 * redeems the provider's code. An omitted scope is the scope the hub asked for (RFC 6749 section
 * 5.1).
 */
export async function finishConnection(args: {
  provider: ConnectionProvider;
  callbackUrl: string;
  currentUrl: URL;
  state: string;
  codeVerifier: string;
  fetch: FetchFunction;
  now: number;
}): Promise<Tokens> {
  const { provider } = args;
  const client: oauth.Client = { client_id: Redacted.value(provider.clientId) };
  const params = oauth.validateAuthResponse(provider.server, client, args.currentUrl, args.state);
  const response = await oauth.authorizationCodeGrantRequest(
    provider.server,
    client,
    clientAuthentication(provider),
    params,
    args.callbackUrl,
    args.codeVerifier,
    { [oauth.customFetch]: oauthFetch(args.fetch) },
  );
  return tokensOf(
    await oauth.processAuthorizationCodeResponse(
      provider.server,
      client,
      (await provider.mapTokenError?.(response)) ?? response,
    ),
    provider.scopes.join(" "),
    args.now,
  );
}

/**
 * The provider's refresh of its token. An omitted scope stays omitted: on refresh it means the
 * original grant (RFC 6749 section 6), which the hub does not keep.
 */
export async function refreshConnection(args: {
  provider: ConnectionProvider;
  refreshToken: string;
  fetch: FetchFunction;
  now: number;
}): Promise<Tokens> {
  const { provider } = args;
  const client: oauth.Client = { client_id: Redacted.value(provider.clientId) };
  const response = await oauth.refreshTokenGrantRequest(
    provider.server,
    client,
    clientAuthentication(provider),
    args.refreshToken,
    {
      [oauth.customFetch]: oauthFetch(args.fetch),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    },
  );
  return tokensOf(
    await oauth.processRefreshTokenResponse(
      provider.server,
      client,
      (await provider.mapTokenError?.(response)) ?? response,
    ),
    "",
    args.now,
  );
}

/** Whether the provider refused the token itself: only its `invalid_grant` ends a grant. */
export const rejected = (error: unknown) =>
  error instanceof oauth.ResponseBodyError && error.error === "invalid_grant";

/** The error codes of RFC 6749 sections 4.1.2.1 and 5.2, which a log line may name. */
const OAUTH_ERRORS = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
]);

/**
 * What a log line says of a provider failure: a standard OAuth error code, else the class name.
 * Provider errors carry token responses and free text, and none of that is logged.
 */
export function failureName(error: unknown) {
  if (
    (error instanceof oauth.AuthorizationResponseError ||
      error instanceof oauth.ResponseBodyError) &&
    OAUTH_ERRORS.has(error.error)
  ) {
    return error.error;
  }
  return error instanceof Error ? error.constructor.name : typeof error;
}

/** Whether the user declined at the provider. */
export const declined = (error: unknown) =>
  error instanceof oauth.AuthorizationResponseError && error.error === "access_denied";
