import { Predicate, Redacted, Schema } from "effect";
import * as oauth from "oauth4webapi";
import type { OauthConnector, OidcConnector, UpstreamIdentity } from "./types.ts";

/**
 * The provider's metadata cannot be read, or names no authorization endpoint, when a sign-in
 * goes to it. The router answers 500. It keeps no cause: the provider's answer is not logged.
 */
export class ProviderUnavailable extends Schema.TaggedError<ProviderUnavailable>()(
  "ProviderUnavailable",
  {},
) {}

/** The core's `Fetch` service function. */
export type FetchFunction = (request: Request) => Promise<Response>;

/** `fetch` as oauth4webapi's custom fetch: every upstream request goes through the core's `Fetch`. */
export function oauthFetch(fetch: FetchFunction) {
  return <Method extends string, Body extends RequestInit["body"]>(
    url: string,
    options: oauth.CustomFetchOptions<Method, Body>,
  ): Promise<Response> =>
    fetch(
      new Request(url, {
        method: options.method,
        headers: options.headers,
        body: options.body ?? null,
        redirect: options.redirect,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      }),
    );
}

/**
 * Discovery, once per kind and issuer per `Fetch` function: one in an isolate, and one per test.
 * RFC 8414 metadata for a plain OAuth connector, OIDC Discovery for an OIDC one. oauth4webapi then
 * holds each callback to that metadata, so a provider that advertises
 * `authorization_response_iss_parameter_supported` must send `iss` (RFC 9207).
 */
const discovered = new WeakMap<FetchFunction, Map<string, oauth.AuthorizationServer>>();

/**
 * The cache holds only finished metadata, never a pending request: on Cloudflare the I/O of a
 * request belongs to that request, so a second request must not wait on it.
 */
async function authorizationServer(
  connector: OauthConnector | OidcConnector,
  fetch: FetchFunction,
): Promise<oauth.AuthorizationServer> {
  const cache = discovered.get(fetch) ?? new Map<string, oauth.AuthorizationServer>();
  discovered.set(fetch, cache);
  const key = `${connector.kind}:${connector.issuer}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const issuer = new URL(connector.issuer);
  const response = await oauth.discoveryRequest(issuer, {
    algorithm: connector.kind === "oauth" ? "oauth2" : "oidc",
    [oauth.customFetch]: oauthFetch(fetch),
  });
  const as = await oauth.processDiscoveryResponse(issuer, response);
  cache.set(key, as);
  return as;
}

export type UpstreamStart = {
  url: string;
  state: string;
  codeVerifier: string;
  nonce: string | undefined;
};

/** The authorization URL for a connector, with fresh state, PKCE pair and, for OIDC, a nonce. */
export async function startUpstream(args: {
  connector: OauthConnector | OidcConnector;
  callbackUrl: string;
  freshLogin: boolean;
  fetch: FetchFunction;
}): Promise<UpstreamStart> {
  const as = await authorizationServer(args.connector, args.fetch);
  if (as.authorization_endpoint === undefined) {
    throw new Error(`Connector "${args.connector.name}" has no authorization endpoint`);
  }
  const url = new URL(as.authorization_endpoint);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    as.authorization_endpoint.includes("#")
  ) {
    throw new Error(`Connector "${args.connector.name}" has an unsafe authorization endpoint`);
  }
  const state = oauth.generateRandomState();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const nonce = args.connector.kind === "oidc" ? oauth.generateRandomNonce() : undefined;
  url.searchParams.set("client_id", Redacted.value(args.connector.clientId));
  url.searchParams.set("redirect_uri", args.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", args.connector.scopes.join(" "));
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (nonce !== undefined) {
    url.searchParams.set("nonce", nonce);
  }
  if (args.freshLogin && args.connector.kind === "oidc") {
    // With max_age the provider must return auth_time (OIDC Core 3.1.2.1), which the callback
    // checks; prompt=login asks for the login itself.
    url.searchParams.set("prompt", "login");
    url.searchParams.set("max_age", "0");
  } else if (args.connector.selectAccount === true) {
    url.searchParams.set("prompt", "select_account");
  }
  return { url: url.toString(), state, codeVerifier, nonce };
}

export type UpstreamFinish = {
  identity: UpstreamIdentity;
  /**
   * The id_token's `auth_time`, in seconds: when the provider last authenticated the user. A plain
   * OAuth connector has no id_token and an OIDC provider may omit the claim, so it can be absent.
   */
  authTimeSeconds: number | undefined;
};

/**
 * The connector callback: validate the response, exchange the code, and read the identity. Errors
 * propagate; the caller turns them into a redirect back to the client.
 */
export async function finishUpstream(args: {
  connector: OauthConnector | OidcConnector;
  callbackUrl: string;
  currentUrl: URL;
  state: string;
  codeVerifier: string;
  nonce: string | undefined;
  fetch: FetchFunction;
}): Promise<UpstreamFinish> {
  const as = await authorizationServer(args.connector, args.fetch);
  const client: oauth.Client = { client_id: Redacted.value(args.connector.clientId) };
  const secret = Redacted.value(args.connector.clientSecret);
  const clientAuth =
    args.connector.tokenEndpointAuthMethod === "client_secret_basic"
      ? oauth.ClientSecretBasic(secret)
      : oauth.ClientSecretPost(secret);
  const params = oauth.validateAuthResponse(as, client, args.currentUrl, args.state);
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    params,
    args.callbackUrl,
    args.codeVerifier,
    { [oauth.customFetch]: oauthFetch(args.fetch) },
  );
  if (args.connector.kind === "oauth") {
    const tokens = await oauth.processAuthorizationCodeResponse(as, client, response);
    return {
      identity: await args.connector.identity(tokens.access_token, args.fetch),
      authTimeSeconds: undefined,
    };
  }
  const tokens = await oauth.processAuthorizationCodeResponse(as, client, response, {
    requireIdToken: true,
    ...(args.nonce === undefined ? {} : { expectedNonce: args.nonce }),
  });
  const claims = oauth.getValidatedIdTokenClaims(tokens);
  if (claims === undefined) {
    throw new Error(`Connector "${args.connector.name}" returned no id_token`);
  }
  // Each profile claim is kept when it has its type and left out when it does not.
  const identity: UpstreamIdentity = { upstreamId: claims.sub };
  if (Predicate.isString(claims["email"])) {
    identity.email = claims["email"];
  }
  if (Predicate.isBoolean(claims["email_verified"])) {
    identity.emailVerified = claims["email_verified"];
  }
  if (Predicate.isString(claims["name"])) {
    identity.name = claims["name"];
  }
  if (Predicate.isString(claims["picture"])) {
    identity.picture = claims["picture"];
  }
  // oauth4webapi rejects an id_token whose `auth_time` is present and not a non-negative number.
  return { identity, authTimeSeconds: claims.auth_time };
}
