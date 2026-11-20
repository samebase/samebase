// The hub's calls to a connection provider: the authorization URL with the hub's own state and
// PKCE (RFC 7636), the code exchange (RFC 6749 section 4.1.3), and the refresh (section 6) and
// revocation (RFC 7009) that the hub forwards with its own client authentication. Every request
// goes through the core's `Fetch`. Errors propagate; the handler decides what they mean.
import { Redacted } from "effect";
import * as oauth from "oauth4webapi";
import { oauthFetch, type FetchFunction } from "../core/connectors/upstream.ts";
import type { ConnectionProvider } from "./providers.ts";
import type { ProviderTokens } from "./tables.ts";

/** A refresh or a revocation that the hub forwards ends after this time. */
const FORWARD_TIMEOUT_MS = 30 * 1000;

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
 * The provider's refresh of the client's refresh token, with the hub's client authentication. An
 * omitted scope stays omitted: on refresh it means the original grant (RFC 6749 section 6), which
 * the hub does not keep.
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
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
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

/** The provider's revocation of a token of the client (RFC 7009 section 2.1). */
export async function revokeConnection(args: {
  provider: ConnectionProvider;
  token: string;
  tokenTypeHint: string | null;
  fetch: FetchFunction;
}) {
  const { provider } = args;
  const response = await oauth.revocationRequest(
    provider.server,
    { client_id: Redacted.value(provider.clientId) },
    clientAuthentication(provider),
    args.token,
    {
      ...(args.tokenTypeHint === null
        ? {}
        : { additionalParameters: { token_type_hint: args.tokenTypeHint } }),
      [oauth.customFetch]: oauthFetch(args.fetch),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    },
  );
  await oauth.processRevocationResponse(response);
}

/**
 * The provider's refusal with an error code of RFC 6749 section 5.2, which the client gets as
 * the provider gave it. Undefined for any other failure: a timeout, a network failure, or an
 * answer that is not an OAuth refusal.
 */
export const refusal = (error: unknown) =>
  error instanceof oauth.ResponseBodyError && error.status === 400 ? error.error : undefined;

/**
 * The error codes of RFC 6749 sections 4.1.2.1 and 5.2, and of RFC 7009 section 2.2.1, which a
 * log line may name.
 */
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
  "unsupported_token_type",
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
