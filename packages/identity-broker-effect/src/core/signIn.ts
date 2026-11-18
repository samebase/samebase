// The sign-in endpoints of the broker: discovery, JWKS, authorize, continue, the connector
// callbacks, token and UserInfo. Ported from packages/identity-broker/src/client/index.ts with every
// check, its order, every status, header, body and error text. `ctx.runQuery` and
// `ctx.runMutation` are `command(...)`, in the same order; no command is retried.
import { Cause, Clock, Effect, Redacted, Result, Schema } from "effect";
import * as oauth from "oauth4webapi";
import { command } from "./command.ts";
import type { Connector } from "./connectors/types.ts";
import { finishUpstream, ProviderUnavailable, startUpstream } from "./connectors/upstream.ts";
import { errorPage, signInPage, type Consent } from "./html.ts";
import { logHubEvent } from "./hubEvents.ts";
import {
  signAccessToken,
  signIdToken,
  TOKEN_TTL_SECONDS,
  verifyAccessToken,
  type IdentityClaims,
} from "./jwt.ts";
import { parseKeySet, publicJwks, SIGNING_ALGORITHM } from "./keys.ts";
import { decide, pageShown, usableNow, type Decision, type Registration } from "./policy.ts";
import {
  LOOPBACK_HOSTS,
  readBearerToken,
  readClientAuthentication,
  validateAuthorizeRest,
  validateAuthorizeTarget,
  validateTokenRequest,
} from "./protocol.ts";
import {
  authorizationError,
  authorizationResponse,
  invalidToken,
  json,
  noToken,
  oauthError,
  readParameters,
  redirect,
} from "./responses.ts";
import { Fetch, HubConfig, Keys, type HubConfigShape } from "./services.ts";
import { randomToken, s256Challenge, sha256HexEffect } from "./subject.ts";

/** A request lives this long from /authorize to the code redirect. */
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
/** A code is redeemed by the client's callback at once. */
const CODE_TTL_MS = 60 * 1000;
/** How far an upstream `auth_time` may sit outside the request's lifetime: the clocks differ. */
const AUTH_TIME_SKEW_SECONDS = 60;
/** The scopes the broker grants; any other requested scope is dropped. */
const SCOPES = ["openid", "email", "profile"];
/** How long `cleanup` keeps an audit row of an issued id_token. */
export const SIGN_IN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** What `decide` reads of a client's facts. */
type Found = {
  readonly client: { readonly connectors: ReadonlyArray<string> };
  readonly registration: Registration | null;
};

/** The decision for a client at this request; null when the policy refused it (see `decide`). */
const decideFor = (hub: HubConfigShape, found: Found): Decision | null =>
  decide({
    policy: hub.registration?.policy,
    registration: found.registration,
    enrollment: found.client.connectors,
    configured: [...hub.connectorsByName.keys()],
  });

/** The configured connectors of these names, in this order. A name no longer configured is skipped. */
const connectorsNamed = (hub: HubConfigShape, names: ReadonlyArray<string>): Connector[] =>
  names.flatMap((name) => {
    const connector = hub.connectorsByName.get(name);
    return connector === undefined ? [] : [connector];
  });

/**
 * `/authorize` binds each request to the browser that started it (RFC 9700 section 2.1.1) with one
 * cookie per request, named after the request id, so two sign-ins in one browser keep their own.
 * `__Host-` needs Path=/, so a path issuer uses a plain name scoped to its path.
 */
function txnCookies(hub: HubConfigShape) {
  const prefix = hub.prefix === "" ? "__Host-broker_txn_" : "broker_txn_";
  const attributes = `Path=${hub.prefix === "" ? "/" : hub.prefix}; HttpOnly; Secure; SameSite=Lax`;
  /** The transaction cookies the browser sent, by request id. */
  const read = (request: Request): Map<string, string> => {
    const cookies = new Map<string, string>();
    for (const pair of request.headers.get("cookie")?.split(";") ?? []) {
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      if (separator > 0 && name.startsWith(prefix)) {
        cookies.set(name.slice(prefix.length), pair.slice(separator + 1).trim());
      }
    }
    return cookies;
  };
  return {
    read,
    /** Whether the browser holds the cookie whose hash the request stores. */
    bound: Effect.fnUntraced(function* (
      request: Request,
      stored: { requestId: string; txnCookieHash: string },
    ) {
      const cookie = read(request).get(stored.requestId);
      return cookie !== undefined && (yield* sha256HexEffect(cookie)) === stored.txnCookieHash;
    }),
    /** The Set-Cookie value that deletes a request's cookie, when the browser sent one. */
    clear: (request: Request, requestId: string): string | undefined =>
      read(request).has(requestId) ? `${prefix}${requestId}=; ${attributes}; Max-Age=0` : undefined,
    set: (requestId: string, value: string) =>
      `${prefix}${requestId}=${value}; ${attributes}; Max-Age=${AUTH_REQUEST_TTL_MS / 1000}`,
  };
}

const unboundPage = () =>
  errorPage(
    "Sign-in not continued",
    "This sign-in did not start in this browser. Return to the app and try again.",
    400,
  );
/** The tenant of the client is blocked. */
const offPage = () => errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403);
/** The policy pauses the client. */
const pausedPage = () => errorPage("Sign-in is off", "Sign-in is paused. Try again later.", 503);
/** The policy failed, or the client has no facts for it. */
const unavailablePage = () =>
  errorPage("Sign-in unavailable", "Sign-in is not available right now. Try again later.", 503);

/**
 * A refusal before the user continued from the hub's page, or, with no page, before the redirect
 * to the provider: an error page, for every client. The user has not accepted the return address,
 * so nothing sends the user there (RFC 9700 section 4.11.2; a departure from OIDC Core section
 * 3.1.2.6, named in docs/design.md).
 */
const refusePage = (description: string) => errorPage("Sign-in refused", description, 400);

/** The signing keys of this request. A missing or malformed key set is a defect of the host: 500. */
const keySet = Effect.gen(function* () {
  const raw = (yield* Keys).read();
  return yield* parseKeySet(raw === undefined ? undefined : Redacted.value(raw)).pipe(Effect.orDie);
});

const callbackUrl = (hub: HubConfigShape, connector: Connector) =>
  `${hub.issuer}/connectors/${connector.name}/callback`;

const metadata = (hub: HubConfigShape) => {
  const { issuer, registration } = hub;
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    // The client registration endpoint of RFC 7591, in hub mode. It needs an initial access token.
    // `op_tos_uri` is the terms that every new client's answer names (OpenID Connect Discovery).
    ...(registration === undefined
      ? {}
      : { registration_endpoint: `${issuer}/register`, op_tos_uri: registration.terms }),
    scopes_supported: SCOPES,
    // An extension: the names a registration may enroll in. What a client may use is in its
    // registration answer.
    connectors_supported: [...hub.connectorsByName.keys()],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [SIGNING_ALGORITHM],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "auth_time",
      "nonce",
      "email",
      "email_verified",
      "name",
      "picture",
      "connector",
    ],
    authorization_response_iss_parameter_supported: true,
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
  };
};

export const discovery = Effect.fn("discovery")(function* (_request: Request) {
  const hub = yield* HubConfig;
  return json(metadata(hub), 200, { "Cache-Control": "public, max-age=300" });
});

export const jwks = Effect.fn("jwks")(function* (_request: Request) {
  return json(publicJwks(yield* keySet), 200, { "Cache-Control": "public, max-age=300" });
});

/**
 * Freshness is honored only as prompt=login upstream: a plain OAuth connector, or an OIDC
 * connector whose provider documents no `login` value, is refused, never pretended.
 */
const cannotReauthenticate = (connector: Connector) =>
  connector.kind === "oauth" || !connector.promptLogin;
// Also an error_description at the return address, so no label (RFC 6749 section 4.1.2.1).
const freshLoginRefusal =
  "This sign-in method cannot reauthenticate the user, which prompt=login or max_age asked for.";

/**
 * Sends the user to a connector for a stored request. `refuse` answers a refusal: the hub's
 * error page from `/authorize`, where the user has not continued, and the authorization error
 * at the return address from `/continue`, where the user has.
 */
const startConnector = Effect.fn("startConnector")(function* (args: {
  connector: Connector;
  request: { requestId: string; freshLogin: boolean };
  decision: Decision;
  refuse: (error: string, description: string) => Response;
}) {
  const hub = yield* HubConfig;
  const { fetch } = yield* Fetch;
  const { connector, request } = args;
  if (request.freshLogin && cannotReauthenticate(connector)) {
    return args.refuse("login_required", freshLoginRefusal);
  }
  // A provider whose metadata cannot be read answers 500, as the source's thrown error.
  const start = yield* Effect.tryPromise({
    try: () =>
      startUpstream({
        connector,
        callbackUrl: callbackUrl(hub, connector),
        freshLogin: request.freshLogin,
        fetch,
      }),
    catch: () => new ProviderUnavailable(),
  });
  const now = yield* Clock.currentTimeMillis;
  const result = yield* command("authRequests.startUpstream", {
    requestId: request.requestId,
    connector: connector.name,
    upstreamStateHash: yield* sha256HexEffect(start.state),
    upstreamCodeVerifier: start.codeVerifier,
    ...(start.nonce === undefined ? {} : { upstreamNonce: start.nonce }),
    policy: args.decision,
    now,
  });
  if (!result.ok) {
    switch (result.error) {
      case "not_found":
        return errorPage(
          "Sign-in not found",
          "This sign-in is unknown. Return to the app and try again.",
          404,
        );
      case "expired":
        return args.refuse("access_denied", "The sign-in expired.");
      case "wrong_status":
        return args.refuse("access_denied", "The sign-in already moved on.");
      case "refused":
        return args.refuse("access_denied", "That sign-in method is no longer available.");
      default:
        return result satisfies never;
    }
  }
  return redirect(start.url);
});

const continueHref = (hub: HubConfigShape, requestId: string, connector: Connector) =>
  `${hub.prefix}/continue?request=${encodeURIComponent(requestId)}&connector=${encodeURIComponent(connector.name)}`;

/**
 * What a hub's sign-in page names when it asks for consent: the deploy and the repository from
 * the client's facts, which the hub checked (RFC 7591 section 5).
 */
function consentOf(
  hub: HubConfigShape,
  facts: Registration,
  client: { clientName: string },
  scopes: string[],
  loopback: boolean,
): Consent {
  let deployment: Consent["deployment"];
  switch (facts.deploymentType) {
    case "production":
      deployment = { kind: "production" };
      break;
    case "preview":
      deployment = { kind: "preview", stage: client.clientName };
      break;
    case "development":
      deployment = { kind: "development" };
      break;
    default:
      return facts.deploymentType satisfies never;
  }
  return {
    loopback,
    deployment,
    repository: facts.repository,
    scopes,
    reviewer: hub.registration?.name ?? new URL(hub.issuer).host,
  };
}

/**
 * An authorization request with `resource`. No API resource provider is configured in this
 * package, so this answers as the source's resource flow does with no provider: the checks on the
 * client and the policy, then "Request one configured API resource." (design section 9 item 1).
 */
const resourceAuthorize = Effect.fn("resourceAuthorize")(function* (
  found: Found & { app: { suspended: boolean } | null },
) {
  const hub = yield* HubConfig;
  if (found.app === null) {
    return errorPage("API authorization unavailable", "The client's app is gone.", 400);
  }
  if (found.app.suspended) {
    return errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403);
  }
  const decision = decideFor(hub, found);
  if (decision === null) {
    return errorPage(
      "API authorization unavailable",
      "Authorization is not available right now. Try again later.",
      503,
    );
  }
  if (decision.paused) {
    return errorPage(
      "API authorization unavailable",
      "Authorization is paused. Try again later.",
      503,
    );
  }
  return errorPage("API authorization refused", "Request one configured API resource.", 400);
});

export const authorize = Effect.fn("authorize")(function* (request: Request) {
  const hub = yield* HubConfig;
  const cookies = txnCookies(hub);
  const params = yield* Effect.promise(() => readParameters(request));
  if (params === null) {
    return oauthError(415, "invalid_request", "A POST must be application/x-www-form-urlencoded.");
  }
  const target = validateAuthorizeTarget(params);
  if (!target.ok) {
    return errorPage("Invalid sign-in request", target.description, target.status);
  }
  const found = yield* command("clients.forAuthorize", { clientId: target.value.clientId });
  if (found === null) {
    return errorPage("Unknown client", "The client_id is not registered with this provider.", 400);
  }
  const { client, app } = found;
  // Exact string comparison, and no redirect to a URI that is not registered (RFC 9700 4.1.3).
  // The request keeps the one the client named: the code exchange must name the same one.
  const redirectUri = target.value.redirectUri;
  if (!client.redirectUris.includes(redirectUri)) {
    return errorPage(
      "Invalid redirect URI",
      "The redirect_uri is not one registered for this client.",
      400,
    );
  }
  if (params.has("resource")) {
    return yield* resourceAuthorize(found);
  }
  const rest = validateAuthorizeRest(params, target.value);
  if (!rest.ok) {
    return refusePage(rest.description);
  }
  if (app === null) {
    return errorPage("Sign-in unavailable", "The client's app is gone.", 400);
  }
  /** A refusal of the policy or of a limit, which the hub's operator can act on. */
  const refused = (reason: string, page: Response) => {
    logHubEvent({ event: "sign_in_refused", facts: found.registration, connector: null, reason });
    return page;
  };
  if (app.suspended) {
    return refused("suspended", offPage());
  }
  const decision = decideFor(hub, found);
  if (decision === null) {
    return refused("unavailable", unavailablePage());
  }
  if (decision.paused) {
    return refused("paused", pausedPage());
  }
  if (rest.value.prompt.includes("none")) {
    // The broker keeps no session, so it can never answer without interaction.
    return refusePage("This provider has no session to reuse.");
  }
  const freshLogin = rest.value.prompt.includes("login") || rest.value.maxAge !== undefined;
  const scopes = SCOPES.filter((scope) => rest.value.scopes.includes(scope));
  // The set of the request: the connectors the app named, else every one the client may use
  // now (what the policy gives, and what the admin granted its repository). A name outside the
  // enrollment is a request error; an enrolled one that neither allows now is not offered, and
  // a set with none left is a stopped sign-in.
  const named = rest.value.connectors;
  const notEnrolled = named.find((name) => !client.connectors.includes(name));
  if (notEnrolled !== undefined) {
    return refusePage(`This client is not enrolled in the connector "${notEnrolled}".`);
  }
  const usable = usableNow(decision, client.connectors, found.granted);
  const offered = connectorsNamed(
    hub,
    named.length === 0 ? usable : named.filter((name) => usable.includes(name)),
  );
  if (offered.length === 0) {
    return refused("off", offPage());
  }
  // The facts the page names when it asks: a hub asks unless an exemption of its administrator
  // covers the client (`pageShown`). Decided here only, on this snapshot. Without hub mode, no
  // page asks.
  const consent =
    hub.registration !== undefined && found.registration !== null && pageShown(found.exemption)
      ? found.registration
      : null;
  // One offered connector and no consent to ask: straight to it (decision 5 of RFC 137). A fresh
  // login that the connector cannot do is refused here, before anything is stored.
  const direct = offered.length === 1 && consent === null ? offered[0] : undefined;
  if (direct !== undefined && freshLogin && cannotReauthenticate(direct)) {
    return refusePage(freshLoginRefusal);
  }
  // Every later step needs this cookie: a client that fetches the page itself cannot send a
  // user's browser on from it, and a provider callback finishes only where the sign-in started.
  const txnCookie = yield* randomToken(32);
  const now = yield* Clock.currentTimeMillis;
  const requestId = yield* randomToken(24);
  const created = yield* command("authRequests.create", {
    tenantId: app.tenantId,
    requestId,
    appId: app.appId,
    clientId: client.clientId,
    redirectUri,
    scope: scopes.join(" "),
    ...(rest.value.state === undefined ? {} : { state: rest.value.state }),
    ...(rest.value.nonce === undefined ? {} : { nonce: rest.value.nonce }),
    codeChallenge: rest.value.codeChallenge,
    connectors: offered.map((connector) => connector.name),
    policy: decision,
    freshLogin,
    txnCookieHash: yield* sha256HexEffect(txnCookie),
    createdAt: now,
    expiresAt: now + AUTH_REQUEST_TTL_MS,
  });
  if (!created.ok) {
    switch (created.error) {
      case "rate_limited":
        return refused(
          created.error,
          errorPage("Too many sign-ins", "Too many sign-ins for this app. Try again soon.", 429),
        );
      case "suspended":
      case "off":
        return refused(created.error, offPage());
      default:
        return created.error satisfies never;
    }
  }
  // The stored set, which the rule decided with the grants of its own step: a grant revoked
  // since this request's read is neither stored nor shown.
  const stored = connectorsNamed(hub, created.connectors);
  const storedDirect = stored.length === 1 && consent === null ? stored[0] : undefined;
  if (storedDirect !== undefined && freshLogin && cannotReauthenticate(storedDirect)) {
    // Only when a revoked grant left one connector that the snapshot did not go straight to.
    yield* command("authRequests.abandon", { requestId });
    return refusePage(freshLoginRefusal);
  }
  const setCookie = cookies.set(requestId, txnCookie);
  if (storedDirect !== undefined) {
    const response = yield* startConnector({
      connector: storedDirect,
      request: { requestId, freshLogin },
      decision,
      refuse: (_error, description) => refusePage(description),
    });
    response.headers.append("Set-Cookie", setCookie);
    return response;
  }
  const redirectUrl = new URL(redirectUri);
  const page = signInPage({
    host: redirectUrl.host,
    origin: redirectUrl.origin,
    consent:
      consent === null
        ? null
        : consentOf(hub, consent, client, scopes, LOOPBACK_HOSTS.has(redirectUrl.hostname)),
    connectors: stored.map((connector) => ({
      label: connector.label,
      provider: connector.provider,
      href: continueHref(hub, requestId, connector),
    })),
    legal:
      hub.registration === undefined
        ? null
        : { privacy: hub.registration.privacy, terms: hub.registration.terms },
  });
  page.headers.append("Set-Cookie", setCookie);
  return page;
});

/**
 * A "Continue with" click on the sign-in page: start that connector. The user accepted the
 * return address on the page, so a refusal from here on is an authorization error there. There
 * is no Cancel: a user who does not continue closes the tab, and the request expires.
 */
export const continueSignIn = Effect.fn("continueSignIn")(function* (request: Request) {
  const hub = yield* HubConfig;
  const cookies = txnCookies(hub);
  const url = new URL(request.url);
  const requestId = url.searchParams.get("request") ?? "";
  const stored = yield* command("authRequests.get", { requestId });
  if (stored === null) {
    return errorPage(
      "Sign-in not found",
      "This sign-in is unknown or finished. Return to the app and try again.",
      404,
    );
  }
  if (!(yield* cookies.bound(request, stored))) {
    return unboundPage();
  }
  const back = {
    redirectUri: stored.redirectUri,
    issuer: hub.issuer,
    state: stored.state,
    clearCookie: cookies.clear(request, requestId),
  };
  const refuse = (error: string, description: string) =>
    authorizationError({ ...back, error, description });
  if (stored.status === "completed" || stored.status === "claimed") {
    return errorPage("Sign-in finished", "This sign-in already finished. Return to the app.", 409);
  }
  // The page's link carries the connector, so a user can edit it: only one of the request's set
  // goes on. The page offered no other, so an edited link gets no redirect.
  const name = url.searchParams.get("connector") ?? "";
  const connector = hub.connectorsByName.get(name);
  if (connector === undefined || !stored.connectors.includes(name)) {
    return errorPage("Unknown connector", "That sign-in method is not offered here.", 404);
  }
  const found = yield* command("clients.withApp", { clientId: stored.clientId });
  if (found === null || found.app === null) {
    return refuse("server_error", "The client's app is gone.");
  }
  if (found.app.suspended) {
    return refuse("access_denied", "Sign-in for this app is turned off.");
  }
  const decision = decideFor(hub, found);
  if (decision === null) {
    return refuse("temporarily_unavailable", "Sign-in is not available right now.");
  }
  if (decision.paused) {
    return refuse("temporarily_unavailable", "Sign-in is paused.");
  }
  if (!usableNow(decision, found.client.connectors, found.granted).includes(name)) {
    return refuse("access_denied", "That sign-in method is no longer available.");
  }
  return yield* startConnector({
    connector,
    request: { requestId, freshLogin: stored.freshLogin },
    decision,
    refuse,
  });
});

/** The class name of a failure, for a log line: provider errors carry tokens and claims. */
const className = (error: unknown) =>
  error instanceof Error ? error.constructor.name : typeof error;

/**
 * The provider's sign-in did not give an identity. `reason` is the provider's error code when it
 * picks a fixed answer, else `failed`; nothing else the provider wrote is kept.
 */
class ProviderSignInFailed extends Schema.TaggedError<ProviderSignInFailed>()(
  "ProviderSignInFailed",
  {
    reason: Schema.Literals(["access_denied", "temporarily_unavailable", "failed"]),
    /** The failure's class name, the one part of it that a log line may hold. */
    className: Schema.String,
  },
) {}

const providerSignInFailed = (error: unknown) =>
  new ProviderSignInFailed({
    reason:
      error instanceof oauth.AuthorizationResponseError &&
      (error.error === "access_denied" || error.error === "temporarily_unavailable")
        ? error.error
        : "failed",
    className: className(error),
  });

/** The provider's redirect back to the hub, for one connector. */
export const upstreamCallback = (connector: Connector) =>
  Effect.fn("upstreamCallback")(function* (request: Request) {
    const hub = yield* HubConfig;
    const { fetch } = yield* Fetch;
    const cookies = txnCookies(hub);
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (state === null) {
      return errorPage("Invalid callback", "The provider sent no state.", 400);
    }
    const now = yield* Clock.currentTimeMillis;
    const upstreamStateHash = yield* sha256HexEffect(state);
    const linkUsedPage = () =>
      errorPage(
        "Sign-in link used",
        "This sign-in link is invalid or was already used. Return to the app and try again.",
        400,
      );
    // The waiting request and its client, read before the claim: the user continued from the
    // page or went straight on, so a refusal from here goes to the return address, once the
    // browser proves it holds the request's cookie. A failed policy writes nothing.
    const waiting = yield* command("authRequests.upstreamClient", { upstreamStateHash });
    if (waiting === null) {
      return linkUsedPage();
    }
    if (!(yield* cookies.bound(request, waiting.request))) {
      return unboundPage();
    }
    const back = {
      redirectUri: waiting.request.redirectUri,
      issuer: hub.issuer,
      state: waiting.request.state,
      clearCookie: cookies.clear(request, waiting.request.requestId),
    };
    const found = waiting.client;
    if (found === null || found.app === null) {
      yield* command("authRequests.abandon", { requestId: waiting.request.requestId });
      return authorizationError({
        ...back,
        error: "server_error",
        description: "The client's app is gone.",
      });
    }
    const decision = decideFor(hub, found);
    if (decision === null) {
      return authorizationError({
        ...back,
        error: "temporarily_unavailable",
        description: "Sign-in is not available right now.",
      });
    }
    const txnCookieHashes: string[] = [];
    for (const cookie of cookies.read(request).values()) {
      txnCookieHashes.push(yield* sha256HexEffect(cookie));
    }
    const claim = yield* command("authRequests.claimUpstream", {
      upstreamStateHash,
      connector: connector.name,
      txnCookieHashes,
      policy: decision,
      now,
    });
    if (claim.status === "missing") {
      return linkUsedPage();
    }
    if (claim.status === "unbound") {
      return unboundPage();
    }
    if (claim.status === "expired") {
      return authorizationError({
        ...back,
        error: "access_denied",
        description: "The sign-in expired.",
      });
    }
    /** The policy, a block, or a changed owner stops the sign-in: to the app, as refused. */
    const stoppedNow = (paused: boolean) =>
      paused
        ? authorizationError({
            ...back,
            error: "temporarily_unavailable",
            description: "Sign-in is paused.",
          })
        : authorizationError({
            ...back,
            error: "access_denied",
            description: "Sign-in for this app is no longer available.",
          });
    if (claim.status === "refused") {
      return stoppedNow(decision.paused);
    }
    const finished = yield* Effect.result(
      Effect.tryPromise({
        try: async () => {
          const upstream = await finishUpstream({
            connector,
            callbackUrl: callbackUrl(hub, connector),
            currentUrl: url,
            state,
            codeVerifier: claim.upstreamCodeVerifier,
            nonce: claim.upstreamNonce,
            fetch,
          });
          // OIDC Core section 2: `sub` must not exceed 255 ASCII characters.
          if (
            !/^\p{ASCII}{1,255}$/u.test(`${connector.provider}:${upstream.identity.upstreamId}`)
          ) {
            throw new Error("The upstream id does not fit in a sub");
          }
          return upstream;
        },
        catch: providerSignInFailed,
      }),
    );
    if (Result.isFailure(finished)) {
      const failure = finished.failure;
      yield* command("authRequests.abandon", { requestId: claim.requestId });
      // The provider's error code picks one fixed answer; nothing the provider wrote is echoed.
      // The connector's label is free text, so no description holds it (RFC 6749 section
      // 4.1.2.1).
      switch (failure.reason) {
        case "access_denied":
          return authorizationError({
            ...back,
            error: "access_denied",
            description: "The provider sign-in was declined.",
          });
        case "temporarily_unavailable":
          return authorizationError({
            ...back,
            error: "temporarily_unavailable",
            description: "The provider is temporarily unavailable.",
          });
        case "failed":
          // Only the class name: provider errors carry token responses and decoded claims.
          console.error(`Connector "${connector.name}" failed: ${failure.className}`);
          return authorizationError({
            ...back,
            error: "server_error",
            description: "The provider sign-in failed.",
          });
        default:
          return failure.reason satisfies never;
      }
    }
    const upstream = finished.success;
    let authTime = now;
    if (claim.freshLogin) {
      // prompt=login and max_age=0 went upstream, but a provider can still reuse its session;
      // only the id_token's auth_time attests a login during this request. It must fall between
      // the request's creation and now, each widened by the clock skew; auth_time is in whole
      // seconds. A plain OAuth connector has no auth_time, and startConnector already refused it.
      const { authTimeSeconds } = upstream;
      if (
        authTimeSeconds === undefined ||
        authTimeSeconds < Math.floor(claim.createdAt / 1000) - AUTH_TIME_SKEW_SECONDS ||
        authTimeSeconds > Math.floor(now / 1000) + AUTH_TIME_SKEW_SECONDS
      ) {
        yield* command("authRequests.abandon", { requestId: claim.requestId });
        return authorizationError({
          ...back,
          error: "login_required",
          description:
            "The provider did not confirm a new login, which prompt=login or max_age asked for.",
        });
      }
      authTime = authTimeSeconds * 1000;
    }
    // The completion: the decision again, on the rows as they are now (the provider took time,
    // and a block, a transfer, or a policy change may have landed), then the rule, which reads
    // those rows once more. The provider's code is spent, so whatever fails in here still
    // answers the app, and the request is abandoned when that write goes through.
    const unavailable = () =>
      authorizationError({
        ...back,
        error: "temporarily_unavailable",
        description: "Sign-in is not available right now.",
      });
    return yield* Effect.gen(function* () {
      const current = yield* command("clients.withApp", { clientId: found.client.clientId });
      const completion = current === null ? null : decideFor(hub, current);
      if (completion === null) {
        yield* command("authRequests.abandon", { requestId: claim.requestId });
        return unavailable();
      }
      const code = yield* randomToken(32);
      const completed = yield* command("authRequests.complete", {
        requestId: claim.requestId,
        identity: { connector: connector.name, ...upstream.identity },
        authTime,
        codeHash: yield* sha256HexEffect(code),
        codeExpiresAt: now + CODE_TTL_MS,
        policy: completion,
        now,
      });
      if (!completed.ok) {
        return completed.error === "refused"
          ? stoppedNow(completion.paused)
          : authorizationError({
              ...back,
              error: "access_denied",
              description: "The sign-in expired.",
            });
      }
      return authorizationResponse({ ...back, params: { code } });
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          console.error(
            `Connector "${connector.name}" completion failed: ${className(Cause.squash(cause))}`,
          );
          // The request stays claimed until it expires when this fails too; nothing can finish it.
          yield* Effect.exit(command("authRequests.abandon", { requestId: claim.requestId }));
          return unavailable();
        }),
      ),
    );
  });

export const token = Effect.fn("token")(function* (request: Request) {
  const hub = yield* HubConfig;
  const params = yield* Effect.promise(() => readParameters(request));
  // RFC 6749 section 5.2: every token error but invalid_client answers 400.
  if (params === null) {
    return oauthError(
      400,
      "invalid_request",
      "The body must be application/x-www-form-urlencoded.",
    );
  }
  const authorization = request.headers.get("authorization");
  // A 401 carries a challenge (RFC 9110 section 15.5.2), which also names the scheme this endpoint
  // takes for a client that sent its secret in the body (RFC 6749 section 5.2).
  const challenge = { "WWW-Authenticate": 'Basic realm="token"' };
  const clientAuth = readClientAuthentication(authorization, params);
  if (!clientAuth.ok) {
    return oauthError(
      clientAuth.status,
      clientAuth.error,
      clientAuth.description,
      clientAuth.status === 401 ? challenge : {},
    );
  }
  if (params.getAll("resource").length > 1)
    return oauthError(400, "invalid_target", "Request one API resource.");
  const validation = validateTokenRequest(params, clientAuth.value);
  if (!validation.ok) {
    return oauthError(validation.status, validation.error, validation.description);
  }
  const now = yield* Clock.currentTimeMillis;
  const resource = params.get("resource") ?? undefined;
  // The policy is decided on the client's rows of this moment; the rule checks them again.
  const found = yield* command("clients.withApp", { clientId: clientAuth.value.clientId });
  if (found === null) {
    return oauthError(401, "invalid_client", "Client authentication failed.", challenge);
  }
  const decision = decideFor(hub, found);
  if (decision === null) {
    return oauthError(503, "temporarily_unavailable", "Sign-in is not available right now.");
  }
  // The client is authenticated in the step that redeems the code. The secret, the code and the
  // app's verifier cross the command boundary only as hashes (design section 2.2).
  const exchange = yield* command("authRequests.exchangeCode", {
    clientId: clientAuth.value.clientId,
    clientSecretHash: yield* sha256HexEffect(clientAuth.value.clientSecret),
    tokenEndpointAuthMethod: clientAuth.value.method,
    codeHash: yield* sha256HexEffect(validation.value.code),
    redirectUri: validation.value.redirectUri,
    codeChallengeOfVerifier: yield* s256Challenge(validation.value.codeVerifier),
    ...(resource === undefined ? {} : { resource }),
    policy: decision,
    now,
  });
  if (!exchange.ok) {
    return exchange.error === "invalid_client"
      ? oauthError(401, "invalid_client", exchange.description, challenge)
      : oauthError(400, exchange.error, exchange.description);
  }
  const keys = yield* keySet;
  const connector = hub.connectorsByName.get(exchange.identity.connector);
  if (connector === undefined) {
    return yield* Effect.die(
      new Error(`The connector "${exchange.identity.connector}" of a sign-in is gone`),
    );
  }
  // A public subject (OIDC Core 8): the provider's own id, the same in every app and every broker,
  // so an app keeps its users' ids when it moves to another broker.
  const sub = `${connector.provider}:${exchange.identity.upstreamId}`;
  // Claims follow the granted scopes (OIDC Core 5.4); userinfo reads them from the access token.
  const scopes = exchange.scope.split(" ");
  const claims: IdentityClaims = { sub, connector: exchange.identity.connector };
  if (scopes.includes("email") && exchange.identity.email !== undefined) {
    claims.email = exchange.identity.email;
    claims.email_verified = exchange.identity.emailVerified === true;
  }
  if (scopes.includes("profile") && exchange.identity.name !== undefined) {
    claims.name = exchange.identity.name;
  }
  if (scopes.includes("profile") && exchange.identity.picture !== undefined) {
    claims.picture = exchange.identity.picture;
  }
  const [idToken, accessToken] = yield* Effect.promise(() =>
    Promise.all([
      signIdToken({
        keySet: keys,
        issuer: hub.issuer,
        clientId: exchange.clientId,
        claims,
        authTime: exchange.authTime,
        nonce: exchange.nonce,
      }),
      signAccessToken({ keySet: keys, issuer: hub.issuer, clientId: exchange.clientId, claims }),
    ]),
  );
  yield* command("signIns.record", {
    appId: exchange.appId,
    clientId: exchange.clientId,
    connector: exchange.identity.connector,
    sub,
    at: now,
  });
  logHubEvent({
    event: "sign_in",
    facts: found.registration,
    connector: exchange.identity.connector,
    reason: null,
  });
  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    id_token: idToken,
    scope: exchange.scope,
  });
});

export const userinfo = Effect.fn("userinfo")(function* (request: Request) {
  const hub = yield* HubConfig;
  // Only the Authorization header (RFC 6750 section 2.1): a token in the body or query is none.
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (bearer === null) {
    return noToken("userinfo");
  }
  const keys = yield* keySet;
  const verified = yield* Effect.promise(() =>
    verifyAccessToken({ keySet: keys, issuer: hub.issuer, token: bearer }),
  );
  // A deleted client's tokens die with it (RFC 7592 section 2.3); a paused client's live to expiry.
  if (
    verified === null ||
    (yield* command("clients.get", { clientId: verified.clientId })) === null
  ) {
    return invalidToken();
  }
  return json(verified.claims);
});
