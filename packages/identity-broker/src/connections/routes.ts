// The connections part over HTTP: `/authorize` with `resource` (RFC 8707), the provider's callback
// at `/connections/<name>/callback`, both grants of `/token` for a connection, and `/revoke`
// (RFC 7009). The wire protocol is the Convex broker's (src/client/resources.ts of
// 0.34.0), except that the hub is pass-through: the client gets and holds the provider's own
// refresh token, and the hub forwards a refresh or a revocation with its provider client
// authentication. Each step that moves a connection on is one command that reads the card in its
// own transaction (rules.ts); every call to the provider is outside a command.
import { Cause, Clock, Effect, Exit, Result } from "effect";
import type { SecretServices } from "../core/connectors/types.ts";
import { errorPage } from "../core/html.ts";
import { logHubEvent } from "../core/hubEvents.ts";
import {
  readClientAuthentication,
  validateAuthorizeRest,
  validateAuthorizeTarget,
  validateTokenRequest,
} from "../core/protocol.ts";
import {
  authorizationResponse,
  json,
  oauthError,
  readParameters,
  redirect,
} from "../core/responses.ts";
import type { Part, Route } from "../core/router.ts";
import { Fetch, HubConfig, LiveGates, type HubConfigShape } from "../core/services.ts";
import { toApp, txnCookies } from "../core/signIn.ts";
import { randomToken, s256Challenge, sha256HexEffect } from "../core/subject.ts";
import type { Return } from "../rules/schemas.ts";
import { command } from "./commands.ts";
import {
  checkProviders,
  readProvider,
  type ConnectionProvider,
  type ConnectionSpec,
} from "./providers.ts";
import type { Refused } from "./rules.ts";
import type { ProviderTokens } from "./tables.ts";
import {
  declined,
  failureName,
  finishConnection,
  refreshConnection,
  refusal,
  revokeConnection,
  startConnection,
} from "./upstream.ts";

/** A connection lives this long from `/authorize` to the provider's callback. */
const REQUEST_TTL_MS = 10 * 60 * 1000;
/** A code is redeemed by the client's callback at once. */
const CODE_TTL_MS = 60 * 1000;
/** RFC 6749 section 5.2: a 401 names the scheme that the endpoint takes. */
const challenge = { "WWW-Authenticate": 'Basic realm="token"' };

const refusedPage = () =>
  errorPage("API authorization unavailable", "This client cannot connect this API resource.", 403);

/**
 * The token response of RFC 6749 section 5.1 with the provider's tokens unchanged. The provider's
 * expiry started upstream, so `expires_in` counts from now.
 */
const tokenResponse = (tokens: typeof ProviderTokens.Type, now: number) =>
  json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    ...(tokens.scope === "" ? {} : { scope: tokens.scope }),
    ...(tokens.expiresAt === undefined
      ? {}
      : { expires_in: Math.max(0, Math.floor((tokens.expiresAt - now) / 1000)) }),
    ...(tokens.refreshToken === undefined ? {} : { refresh_token: tokens.refreshToken }),
  });

/** A provider that did not answer, or answered with no OAuth refusal. It is never `invalid_grant`. */
const unavailable = () =>
  oauthError(503, "temporarily_unavailable", "The provider is unavailable. Retry shortly.");

/** The answer of RFC 6749 section 5.2 when the client's credentials could not be read. */
const clientAuthError = (clientAuth: {
  readonly status: number;
  readonly error: string;
  readonly description: string;
}) =>
  oauthError(
    clientAuth.status,
    clientAuth.error,
    clientAuth.description,
    clientAuth.status === 401 ? challenge : {},
  );

/** The client's credentials as a command takes them: the secret only as its hash. */
const clientArgs = Effect.fnUntraced(function* (client: {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly method: "client_secret_post" | "client_secret_basic";
}) {
  return {
    clientId: client.clientId,
    clientSecretHash: yield* sha256HexEffect(client.clientSecret),
    tokenEndpointAuthMethod: client.method,
  };
});

/** The connections part over `providers`, for the router (src/core/router.ts). */
export const connectionsPart = (providers: ReadonlyArray<ConnectionProvider>): Part => {
  const byResource = new Map(providers.map((provider) => [provider.resource, provider]));
  /** What every step knows of the hub now: its providers and the live gates of this request. */
  const hubNow = Effect.gen(function* () {
    return {
      providers: providers.map((provider) => ({
        name: provider.name,
        resource: provider.resource,
      })),
      liveGates: yield* (yield* LiveGates).read,
    };
  });
  const callbackUrl = (hub: HubConfigShape, provider: ConnectionProvider) =>
    `${hub.issuer}/connections/${provider.name}/callback`;
  /** The provider's name in a `hub_event` line. */
  const nameOf = (resource: string) => byResource.get(resource)?.name ?? null;
  /** The `hub_event` line of a refusal that a step's rule returned. */
  const logRefused = (
    event: "connection_refused" | "refresh_refused",
    refused: typeof Refused.Type,
  ) =>
    logHubEvent({
      event,
      clientId: refused.clientId,
      ref: refused.ref,
      connector: nameOf(refused.resource),
      reason: refused.reason,
    });
  /** The reason of a provider failure: its OAuth error code, or `unavailable`. */
  const providerReason = (error: unknown) =>
    refusal(error) === undefined ? "unavailable" : failureName(error);

  /**
   * The start of a connection. Nobody has continued from a page, so every refusal is an error
   * page here, as at the core's `/authorize` (RFC 9700 section 4.11.2).
   */
  const authorize = Effect.fn("connections.authorize")(function* (
    _request: Request,
    params: URLSearchParams,
  ) {
    const hub = yield* HubConfig;
    const target = validateAuthorizeTarget(params);
    if (!target.ok) {
      return errorPage("Invalid connection request", target.description, target.status);
    }
    const resources = params.getAll("resource");
    const provider = resources.length === 1 ? byResource.get(resources[0] ?? "") : undefined;
    if (provider === undefined) {
      return errorPage("API authorization refused", "Request one configured API resource.", 400);
    }
    const rest = validateAuthorizeRest(params, target.value, "resource");
    if (!rest.ok) {
      return errorPage("API authorization refused", rest.description, 400);
    }
    // RFC 6749 section 3.3: an answer without `scope` would say the requested scope was granted.
    if (provider.scopes.length === 0 && rest.value.scopes.length > 0) {
      return errorPage("API authorization refused", "This API resource has no scopes.", 400);
    }
    const start = yield* Effect.promise(() =>
      startConnection(provider, callbackUrl(hub, provider)),
    );
    const now = yield* Clock.currentTimeMillis;
    const requestId = yield* randomToken(24);
    const txnCookie = yield* randomToken(32);
    const created = yield* command("connections.create", {
      requestId,
      clientId: target.value.clientId,
      redirectUri: target.value.redirectUri,
      resource: provider.resource,
      ...(rest.value.state === undefined ? {} : { state: rest.value.state }),
      codeChallenge: rest.value.codeChallenge,
      txnCookieHash: yield* sha256HexEffect(txnCookie),
      upstreamStateHash: yield* sha256HexEffect(start.state),
      upstreamCodeVerifier: start.codeVerifier,
      ...(yield* hubNow),
      now,
      expiresAt: now + REQUEST_TTL_MS,
    });
    if (!created.ok) {
      if (created.refused !== null) {
        logRefused("connection_refused", created.refused);
      }
      switch (created.error) {
        case "unknown_client":
          return errorPage(
            "Unknown client",
            "The client_id is not registered with this provider.",
            400,
          );
        case "redirect_uri":
          return errorPage(
            "Invalid redirect URI",
            "The redirect_uri is not one registered for this client.",
            400,
          );
        case "stopped":
          return errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403);
        case "refused":
          return refusedPage();
        case "rate_limited":
          return errorPage(
            "Too many sign-ins",
            "Too many sign-ins for this app. Try again soon.",
            429,
          );
        default:
          return created.error satisfies never;
      }
    }
    const response = redirect(start.url);
    response.headers.append("Set-Cookie", txnCookies(hub).set(requestId, txnCookie));
    return response;
  });

  /** The provider's redirect back to the hub, for one provider. */
  const callback = (provider: ConnectionProvider) =>
    Effect.fn("connections.callback")(function* (request: Request) {
      const hub = yield* HubConfig;
      const { fetch } = yield* Fetch;
      const cookies = txnCookies(hub);
      const url = new URL(request.url);
      const state = url.searchParams.get("state");
      if (state === null) {
        return errorPage("Invalid callback", "The provider sent no state.", 400);
      }
      const txnCookieHashes: string[] = [];
      for (const cookie of cookies.read(request).values()) {
        txnCookieHashes.push(yield* sha256HexEffect(cookie));
      }
      const claim = yield* command("connections.claim", {
        upstreamStateHash: yield* sha256HexEffect(state),
        resource: provider.resource,
        txnCookieHashes,
        ...(yield* hubNow),
        now: yield* Clock.currentTimeMillis,
      });
      if (claim.status === "missing") {
        return errorPage("Authorization unavailable", "The authorization was already used.", 400);
      }
      if (claim.status === "unbound") {
        return errorPage(
          "Authorization unavailable",
          "Return to the browser that started authorization.",
          400,
        );
      }
      // The browser holds the request's cookie: from here on, each outcome goes to the return
      // address that its own step read on the card, with `iss` and the app's state (RFC 9207).
      const answer = (back: Return | null | undefined, error: string, description: string) =>
        toApp(back ?? undefined, {
          issuer: hub.issuer,
          clearCookie: cookies.clear(request, claim.requestId),
          error,
          description,
        });
      const expired = "The authorization expired.";
      const refused = "This client cannot connect this API resource.";
      if (claim.status === "expired") {
        return answer(claim.back, "access_denied", expired);
      }
      if (claim.status === "refused") {
        logRefused("connection_refused", claim.refused);
        return answer(claim.back, "access_denied", refused);
      }
      const abandon = command("connections.abandon", { requestId: claim.requestId });
      const calledAt = yield* Clock.currentTimeMillis;
      const finished = yield* Effect.result(
        Effect.tryPromise({
          try: async () =>
            await finishConnection({
              provider,
              callbackUrl: callbackUrl(hub, provider),
              currentUrl: url,
              state,
              codeVerifier: claim.upstreamCodeVerifier,
              fetch,
              now: calledAt,
            }),
          catch: (error) => error,
        }),
      );
      if (Result.isFailure(finished)) {
        const back = yield* abandon;
        console.error(`Connection "${provider.name}" failed: ${failureName(finished.failure)}`);
        return answer(
          back,
          declined(finished.failure) ? "access_denied" : "server_error",
          "The provider authorization did not complete.",
        );
      }
      // The completion reads the card once more: the provider took time, and a stop or a change
      // of the card may have landed. The provider's code is spent, so whatever fails in here
      // still answers the app, and the request is abandoned when that write goes through.
      return yield* Effect.gen(function* () {
        const code = yield* randomToken(32);
        const now = yield* Clock.currentTimeMillis;
        const completed = yield* command("connections.complete", {
          requestId: claim.requestId,
          tokens: finished.success,
          codeHash: yield* sha256HexEffect(code),
          codeExpiresAt: now + CODE_TTL_MS,
          ...(yield* hubNow),
          now,
        });
        if (!completed.ok) {
          if (completed.error === "refused") {
            logRefused("connection_refused", completed.refused);
          }
          return answer(
            completed.back,
            "access_denied",
            completed.error === "refused" ? refused : expired,
          );
        }
        return authorizationResponse({
          redirectUri: completed.back.redirectUri,
          issuer: hub.issuer,
          state: completed.back.state,
          clearCookie: cookies.clear(request, claim.requestId),
          params: { code },
        });
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            console.error(
              `Connection "${provider.name}" completion failed: ${failureName(Cause.squash(cause))}`,
            );
            // The request stays claimed until it expires when this fails too.
            const abandoned = yield* Effect.exit(abandon);
            return answer(
              Exit.isSuccess(abandoned) ? abandoned.value : undefined,
              "temporarily_unavailable",
              "Authorization is not available right now.",
            );
          }),
        ),
      );
    });

  /**
   * A refresh (RFC 6749 section 6) of the provider's refresh token, which the client holds. One
   * step admits it from the card; then the hub sends the token to the provider with its own client
   * authentication and answers what the provider answered. The hub writes no token. The client
   * runs one refresh of a token at a time: the provider spends a rotated token once.
   */
  const refresh = Effect.fnUntraced(function* (request: Request, params: URLSearchParams) {
    const { fetch } = yield* Fetch;
    const clientAuth = readClientAuthentication(request.headers.get("authorization"), params);
    if (!clientAuth.ok) {
      return clientAuthError(clientAuth);
    }
    const refreshToken = params.get("refresh_token");
    if (refreshToken === null) {
      return oauthError(400, "invalid_request", "refresh_token is required.");
    }
    // RFC 6749 section 3.3: the hub cannot narrow the provider's token and keeps no grant scope.
    if (params.has("scope")) {
      return oauthError(400, "invalid_scope", "A refresh cannot change the scope of this grant.");
    }
    // RFC 8707 section 2.2: the hub keeps no grant, so the resource names the provider.
    const resources = params.getAll("resource");
    if (resources.length !== 1) {
      return oauthError(400, "invalid_target", "Request one API resource.");
    }
    const provider = byResource.get(resources[0] ?? "");
    if (provider === undefined) {
      return oauthError(400, "invalid_target", "Request one configured API resource.");
    }
    const admitted = yield* command("connections.admitRefresh", {
      ...(yield* clientArgs(clientAuth.value)),
      resource: provider.resource,
      ...(yield* hubNow),
      now: yield* Clock.currentTimeMillis,
    });
    if (!admitted.ok) {
      if (admitted.refused !== null) {
        logRefused("refresh_refused", admitted.refused);
      }
      return admitted.error === "invalid_client"
        ? oauthError(401, admitted.error, admitted.description, challenge)
        : oauthError(400, admitted.error, admitted.description);
    }
    const calledAt = yield* Clock.currentTimeMillis;
    const answered = yield* Effect.result(
      Effect.tryPromise({
        try: async () => await refreshConnection({ provider, refreshToken, fetch, now: calledAt }),
        catch: (error) => error,
      }),
    );
    const line = {
      clientId: clientAuth.value.clientId,
      ref: admitted.ref,
      connector: provider.name,
    };
    if (Result.isFailure(answered)) {
      const error = answered.failure;
      console.error(`Connection "${provider.name}" refresh failed: ${failureName(error)}`);
      logHubEvent({ event: "refresh_refused", ...line, reason: providerReason(error) });
      const refused = refusal(error);
      return refused === undefined
        ? unavailable()
        : oauthError(400, refused, "The provider refused the refresh.");
    }
    logHubEvent({ event: "refresh", ...line, reason: null });
    return tokenResponse(answered.success, yield* Clock.currentTimeMillis);
  });

  /**
   * `/token`: a refresh is the part's; a code is the part's when the part issued it, found by its
   * hash. Anything else is the core's: undefined.
   */
  const token = Effect.fn("connections.token")(function* (
    request: Request,
    params: URLSearchParams,
  ) {
    const grantType = params.get("grant_type");
    if (grantType === "refresh_token") {
      return yield* refresh(request, params);
    }
    const clientAuth = readClientAuthentication(request.headers.get("authorization"), params);
    // Every request that the part does not take answers as the core answers it.
    if (
      grantType !== "authorization_code" ||
      !clientAuth.ok ||
      params.getAll("resource").length > 1
    ) {
      return undefined;
    }
    const validation = validateTokenRequest(params, clientAuth.value);
    if (!validation.ok) {
      return undefined;
    }
    const resource = params.get("resource") ?? undefined;
    const now = yield* Clock.currentTimeMillis;
    const exchange = yield* command("connections.exchangeCode", {
      ...(yield* clientArgs(clientAuth.value)),
      codeHash: yield* sha256HexEffect(validation.value.code),
      redirectUri: validation.value.redirectUri,
      codeChallengeOfVerifier: yield* s256Challenge(validation.value.codeVerifier),
      ...(resource === undefined ? {} : { resource }),
      ...(yield* hubNow),
      now,
    });
    if (!exchange.ok) {
      if (exchange.error === "not_found") {
        return undefined;
      }
      if (exchange.refused !== null) {
        logRefused("connection_refused", exchange.refused);
      }
      return exchange.error === "invalid_client"
        ? oauthError(401, exchange.error, exchange.description, challenge)
        : oauthError(400, exchange.error, exchange.description);
    }
    logHubEvent({
      event: "connection",
      clientId: clientAuth.value.clientId,
      ref: exchange.ref,
      connector: nameOf(exchange.resource),
      reason: null,
    });
    return tokenResponse(exchange.tokens, now);
  });

  /**
   * RFC 7009: the client revokes a provider token that it holds, at the provider that `resource`
   * names. The hub forwards it with its own client authentication when the provider has a
   * revocation endpoint, and answers 200 when it has none: the hub keeps nothing to delete.
   */
  const revoke = Effect.fn("connections.revoke")(function* (request: Request) {
    const { fetch } = yield* Fetch;
    const params = yield* Effect.promise(() => readParameters(request));
    if (params === null) {
      return oauthError(
        400,
        "invalid_request",
        "The body must be application/x-www-form-urlencoded.",
      );
    }
    const clientAuth = readClientAuthentication(request.headers.get("authorization"), params);
    if (!clientAuth.ok) {
      return clientAuthError(clientAuth);
    }
    const token = params.get("token");
    if (token === null) {
      return oauthError(400, "invalid_request", "token is required.");
    }
    const resources = params.getAll("resource");
    const provider = resources.length === 1 ? byResource.get(resources[0] ?? "") : undefined;
    if (provider === undefined) {
      return oauthError(400, "invalid_target", "Request one configured API resource.");
    }
    const ref = yield* command("connections.authenticate", yield* clientArgs(clientAuth.value));
    if (ref === null) {
      return oauthError(401, "invalid_client", "Client authentication failed.", challenge);
    }
    const logRevoke = (reason: string | null) =>
      logHubEvent({
        event: "revoke",
        clientId: clientAuth.value.clientId,
        ref,
        connector: provider.name,
        reason,
      });
    const revoked = new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
    if (provider.server.revocation_endpoint === undefined) {
      logRevoke(null);
      return revoked;
    }
    const answered = yield* Effect.result(
      Effect.tryPromise({
        try: async () =>
          await revokeConnection({
            provider,
            token,
            tokenTypeHint: params.get("token_type_hint"),
            fetch,
          }),
        catch: (error) => error,
      }),
    );
    if (Result.isFailure(answered)) {
      console.error(
        `Connection "${provider.name}" revocation failed: ${failureName(answered.failure)}`,
      );
      logRevoke(providerReason(answered.failure));
      // RFC 7009 section 2.2.1: the provider's refusal, such as `unsupported_token_type`.
      const refused = refusal(answered.failure);
      return refused === undefined
        ? unavailable()
        : oauthError(400, refused, "The provider refused the revocation.");
    }
    logRevoke(null);
    return revoked;
  });

  const routes: ReadonlyArray<Route<LiveGates>> = [
    { method: "POST", path: "/revoke", match: "exact", template: "/revoke", handler: revoke },
    ...providers.map((provider): Route<LiveGates> => ({
      method: "GET",
      path: `/connections/${provider.name}/callback`,
      match: "exact",
      template: `/connections/${provider.name}/callback`,
      handler: callback(provider),
    })),
  ];

  return {
    routes,
    authorize,
    token,
    // RFC 8414: the refresh grant and the revocation endpoint (RFC 7009 section 4).
    metadata: (document) => ({
      ...document,
      scopes_supported: [
        ...new Set([
          ...document.scopes_supported,
          ...providers.flatMap((provider) => provider.scopes),
        ]),
      ],
      grant_types_supported: [...document.grant_types_supported, "refresh_token"],
      revocation_endpoint: `${document.issuer}/revoke`,
      revocation_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    }),
  };
};

/**
 * The connections part of a hub over `specs`, checked before any secret is read, then with each
 * provider's secrets read. A host reads it where it reads its connectors' secrets.
 */
export const makeConnections = Effect.fnUntraced(function* <
  Connection extends ConnectionSpec<unknown>,
>(specs: ReadonlyArray<Connection>) {
  yield* checkProviders(specs);
  return connectionsPart(
    yield* Effect.forEach(
      specs as ReadonlyArray<ConnectionSpec<SecretServices<Connection>>>,
      readProvider,
    ),
  );
});
