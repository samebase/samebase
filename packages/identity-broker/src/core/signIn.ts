// The sign-in endpoints of the broker: discovery, JWKS, authorize, continue, the connector
// callbacks, token and UserInfo. Each step that moves a sign-in on is one command that reads the
// client's card in its own transaction (src/rules/authRequests.ts); a handler decides nothing that
// a later step relies on. No command is retried.
import { Cause, Clock, Effect, Exit, Redacted, Result, Schema } from "effect";
import * as oauth from "oauth4webapi";
import { command } from "./command.ts";
import type { Connector } from "./connectors/types.ts";
import {
  finishUpstream,
  ProviderUnavailable,
  startUpstream,
  type LoginAge,
} from "./connectors/upstream.ts";
import { errorPage, htmlResponse } from "./html.ts";
import { logBrokerEvent } from "./brokerEvents.ts";
import {
  signAccessToken,
  signIdToken,
  TOKEN_TTL_SECONDS,
  verifyAccessToken,
  type IdentityClaims,
} from "./jwt.ts";
import { parseKeySet, publicJwks, SIGNING_ALGORITHM } from "./keys.ts";
import {
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
import {
  Fetch,
  BrokerConfig,
  Keys,
  LiveGates,
  SignInPage,
  type BrokerConfigShape,
} from "./services.ts";
import { randomToken, s256Challenge, sha256HexEffect } from "./subject.ts";
import type { Return } from "../rules/schemas.ts";

/** A request lives this long from /authorize to the code redirect. */
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
/** A code is redeemed by the client's callback at once. */
const CODE_TTL_MS = 60 * 1000;
/** How far an upstream `auth_time` may sit outside the request's lifetime: the clocks differ. */
const AUTH_TIME_SKEW_SECONDS = 60;
/** The scopes the broker grants; any other requested scope is dropped. */
const SCOPES = ["openid", "email", "profile"];

/** The configured connectors of these names, in this order. A name no longer configured is skipped. */
const connectorsNamed = (broker: BrokerConfigShape, names: ReadonlyArray<string>): Connector[] =>
  names.flatMap((name) => {
    const connector = broker.connectorsByName.get(name);
    return connector === undefined ? [] : [connector];
  });

/**
 * `/authorize` binds each request to the browser that started it (RFC 9700 section 2.1.1) with one
 * cookie per request, named after the request id, so two sign-ins in one browser keep their own.
 * `__Host-` needs Path=/, so a path issuer uses a plain name scoped to its path. A connection's
 * request uses the same cookies.
 */
export function txnCookies(broker: BrokerConfigShape) {
  const prefix = broker.prefix === "" ? "__Host-broker_txn_" : "broker_txn_";
  const attributes = `Path=${broker.prefix === "" ? "/" : broker.prefix}; HttpOnly; Secure; SameSite=Lax`;
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
/** A stop holds the card, or the card offers no connector of the request. */
const offPage = () => errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403);
const unknownClientPage = () =>
  errorPage("Unknown client", "The client_id is not registered with this provider.", 400);
const invalidRedirectPage = () =>
  errorPage("Invalid redirect URI", "The redirect_uri is not one registered for this client.", 400);

/**
 * A refusal before the user continued from the broker's page, or, with no page, before the redirect
 * to the provider: an error page, for every client. The user has not accepted the return address,
 * so nothing sends the user there (RFC 9700 section 4.11.2; a departure from OIDC Core section
 * 3.1.2.6, named in docs/design.md).
 */
const refusePage = (description: string) => errorPage("Sign-in refused", description, 400);

/**
 * An authorization error at `back`, the return address that a step read on the card, with the
 * app's state; with no such address, the broker's own error page. The broker sends the user to no
 * address that is not on the card (RFC 6749 section 4.1.2.1).
 */
export const toApp = (
  back: Return | undefined,
  answer: { issuer: string; clearCookie: string | undefined; error: string; description: string },
) =>
  back === undefined
    ? refusePage(answer.description)
    : authorizationError({ ...answer, redirectUri: back.redirectUri, state: back.state });

/** The live gates of the broker's registration layer, read for one sign-in step. */
const liveGates = Effect.gen(function* () {
  return yield* (yield* LiveGates).read;
});

/** The signing keys of this request. A missing or malformed key set is a defect of the host: 500. */
const keySet = Effect.gen(function* () {
  const raw = (yield* Keys).read();
  return yield* parseKeySet(raw === undefined ? undefined : Redacted.value(raw)).pipe(Effect.orDie);
});

const callbackUrl = (broker: BrokerConfigShape, connector: Connector) =>
  `${broker.issuer}/connectors/${connector.name}/callback`;

const metadata = (broker: BrokerConfigShape, registration: boolean) => {
  const { issuer } = broker;
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    // The client registration endpoint of RFC 7591, when a layer mounts it.
    ...(registration ? { registration_endpoint: `${issuer}/register` } : {}),
    // The terms of the broker's sign-in service (OpenID Connect Discovery).
    ...(broker.service === undefined ? {} : { op_tos_uri: broker.service.terms }),
    scopes_supported: SCOPES,
    // An extension: the configured connectors. What a client may use is on its card.
    connectors_supported: broker.configured,
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

/** The discovery document of the core, before a mounted part adds its own fields. */
export type Metadata = ReturnType<typeof metadata>;

/**
 * The discovery documents, with `registration_endpoint` when `registration` is mounted, and the
 * fields that a mounted part adds (`extend`).
 */
export const discovery = (options: {
  readonly registration: boolean;
  readonly extend: (document: Metadata) => object;
}) =>
  Effect.fn("discovery")(function* (_request: Request) {
    const broker = yield* BrokerConfig;
    return json(options.extend(metadata(broker, options.registration)), 200, {
      "Cache-Control": "public, max-age=300",
    });
  });

export const jwks = Effect.fn("jwks")(function* (_request: Request) {
  return json(publicJwks(yield* keySet), 200, { "Cache-Control": "public, max-age=300" });
});

/** What a request asked of the login: a forced login, and a positive `max_age` in seconds. */
type LoginAsked = { readonly freshLogin: boolean; readonly maxAge?: number };

/**
 * What goes upstream for `asked` on `connector`, or undefined: the connector can do neither, and
 * the request is refused, never pretended. A positive `max_age` alone goes as itself to a
 * connector that relays it (docs/decisions/max-age.md), else as a forced login.
 */
const loginAgeOn = (connector: Connector, asked: LoginAsked): LoginAge | undefined => {
  if (!asked.freshLogin && asked.maxAge === undefined) {
    return { kind: "none" };
  }
  if (connector.kind === "oauth") {
    return undefined;
  }
  if (!asked.freshLogin && asked.maxAge !== undefined && connector.maxAge) {
    return { kind: "relay", maxAge: asked.maxAge };
  }
  return connector.promptLogin ? { kind: "forced" } : undefined;
};
// Also an error_description at the return address, so no label (RFC 6749 section 4.1.2.1).
const freshLoginRefusal =
  "This sign-in method cannot reauthenticate the user, which prompt=login or max_age asked for.";

/**
 * Sends the user to a connector for a stored request, with what the caller found for the
 * request's login age on it (`loginAgeOn`). `refuse` answers a refusal of the step, with the
 * return address that the step read on the card: the broker's error page from `/authorize`, where the
 * user has not continued, and `toApp` from `/continue`, where the user has.
 */
const startConnector = Effect.fn("startConnector")(function* (args: {
  connector: Connector;
  requestId: string;
  loginAge: LoginAge;
  refuse: (back: Return | undefined, error: string, description: string) => Response;
}) {
  const broker = yield* BrokerConfig;
  const { fetch } = yield* Fetch;
  const { connector } = args;
  // A provider whose metadata cannot be read answers 500, as the source's thrown error.
  const start = yield* Effect.tryPromise({
    try: () =>
      startUpstream({
        connector,
        callbackUrl: callbackUrl(broker, connector),
        loginAge: args.loginAge,
        fetch,
      }),
    catch: () => new ProviderUnavailable(),
  });
  const now = yield* Clock.currentTimeMillis;
  const result = yield* command("authRequests.startUpstream", {
    requestId: args.requestId,
    connector: connector.name,
    upstreamStateHash: yield* sha256HexEffect(start.state),
    upstreamCodeVerifier: start.codeVerifier,
    ...(start.nonce === undefined ? {} : { upstreamNonce: start.nonce }),
    configured: broker.configured,
    liveGates: yield* liveGates,
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
        return args.refuse(result.back, "access_denied", "The sign-in expired.");
      case "wrong_status":
        return args.refuse(result.back, "access_denied", "The sign-in already moved on.");
      case "refused":
        return args.refuse(
          result.back,
          "access_denied",
          "That sign-in method is no longer available.",
        );
      default:
        return result satisfies never;
    }
  }
  return redirect(start.url);
});

const continueHref = (broker: BrokerConfigShape, requestId: string, connector: Connector) =>
  `${broker.prefix}/continue?request=${encodeURIComponent(requestId)}&connector=${encodeURIComponent(connector.name)}`;

export const authorize = Effect.fn("authorize")(function* (request: Request) {
  const broker = yield* BrokerConfig;
  const cookies = txnCookies(broker);
  const params = yield* Effect.promise(() => readParameters(request));
  if (params === null) {
    return oauthError(415, "invalid_request", "A POST must be application/x-www-form-urlencoded.");
  }
  const target = validateAuthorizeTarget(params);
  if (!target.ok) {
    return errorPage("Invalid sign-in request", target.description, target.status);
  }
  // A snapshot of the card, to answer a bad request before anything is stored. `create` reads the
  // card again and decides.
  const card = yield* command("clients.get", { clientId: target.value.clientId });
  if (card === null) {
    return unknownClientPage();
  }
  // Exact string comparison, and no redirect to a URI that is not registered (RFC 9700 4.1.3).
  // The request keeps the one the client named: the code exchange must name the same one.
  const redirectUri = target.value.redirectUri;
  if (!card.redirectUris.includes(redirectUri)) {
    return invalidRedirectPage();
  }
  if (params.has("resource")) {
    // A broker without the connections part serves no API resource; with it, the router sends a
    // request with `resource` to the part.
    return errorPage("API authorization refused", "Request one configured API resource.", 400);
  }
  const rest = validateAuthorizeRest(params, target.value);
  if (!rest.ok) {
    return refusePage(rest.description);
  }
  /** A refusal of a stop, the card or a limit, which the broker's operator can act on. */
  const refused = (reason: string, page: Response) => {
    logBrokerEvent({
      event: "sign_in_refused",
      clientId: card.clientId,
      ref: card.ref,
      connector: null,
      reason,
    });
    return page;
  };
  if (rest.value.prompt.includes("none")) {
    // The broker keeps no session, so it can never answer without interaction.
    return refusePage("This provider has no session to reuse.");
  }
  const { maxAge } = rest.value;
  const asked: LoginAsked = {
    freshLogin: rest.value.prompt.includes("login") || maxAge === 0,
    ...(maxAge === undefined || maxAge === 0 ? {} : { maxAge }),
  };
  const scopes = SCOPES.filter((scope) => rest.value.scopes.includes(scope));
  // The connectors the app named, else every one on the card. A name that the card does not hold
  // is a request error.
  const named = rest.value.connectors;
  const notOnCard = named.find((name) => !card.connectors.includes(name));
  if (notOnCard !== undefined) {
    return refusePage(`This client cannot use the connector "${notOnCard}".`);
  }
  // A login age that the one connector of the snapshot cannot serve is refused before anything is
  // stored or spent; the stored set is checked again below.
  const offered = connectorsNamed(broker, named.length === 0 ? card.connectors : named);
  const snapshotDirect = offered.length === 1 && !card.confirm ? offered[0] : undefined;
  if (snapshotDirect !== undefined && loginAgeOn(snapshotDirect, asked) === undefined) {
    return refusePage(freshLoginRefusal);
  }
  // Every later step needs this cookie: a client that fetches the page itself cannot send a
  // user's browser on from it, and a provider callback finishes only where the sign-in started.
  const txnCookie = yield* randomToken(32);
  const now = yield* Clock.currentTimeMillis;
  const requestId = yield* randomToken(24);
  const created = yield* command("authRequests.create", {
    requestId,
    clientId: card.clientId,
    redirectUri,
    scope: scopes.join(" "),
    ...(rest.value.state === undefined ? {} : { state: rest.value.state }),
    ...(rest.value.nonce === undefined ? {} : { nonce: rest.value.nonce }),
    codeChallenge: rest.value.codeChallenge,
    requested: named,
    configured: broker.configured,
    liveGates: yield* liveGates,
    ...asked,
    txnCookieHash: yield* sha256HexEffect(txnCookie),
    createdAt: now,
    expiresAt: now + AUTH_REQUEST_TTL_MS,
  });
  if (!created.ok) {
    switch (created.error) {
      case "unknown_client":
        return unknownClientPage();
      case "redirect_uri":
        return invalidRedirectPage();
      case "rate_limited":
        return refused(
          created.error,
          errorPage("Too many sign-ins", "Too many sign-ins for this app. Try again soon.", 429),
        );
      case "stopped":
      case "off":
        return refused(created.error, offPage());
      default:
        return created.error satisfies never;
    }
  }
  // The stored set and `confirm`, as the rule read them from the card in its own step.
  const stored = connectorsNamed(broker, created.connectors);
  // One stored connector and no page to show: straight to it (decision 5 of RFC 137).
  const direct = stored.length === 1 && !created.confirm ? stored[0] : undefined;
  const setCookie = cookies.set(requestId, txnCookie);
  if (direct !== undefined) {
    const loginAge = loginAgeOn(direct, asked);
    if (loginAge === undefined) {
      yield* command("authRequests.abandon", { requestId });
      return refusePage(freshLoginRefusal);
    }
    const response = yield* startConnector({
      connector: direct,
      requestId,
      loginAge,
      refuse: (_back, _error, description) => refusePage(description),
    });
    response.headers.append("Set-Cookie", setCookie);
    return response;
  }
  const redirectUrl = new URL(redirectUri);
  const { render } = yield* SignInPage;
  const page = htmlResponse(
    render({
      host: redirectUrl.host,
      origin: redirectUrl.origin,
      connectors: stored.map((connector) => ({
        label: connector.label,
        provider: connector.provider,
        href: continueHref(broker, requestId, connector),
      })),
      scopes: created.confirm ? scopes : null,
      broker: broker.service ?? null,
    }),
    200,
  );
  page.headers.append("Set-Cookie", setCookie);
  return page;
});

/**
 * A "Continue with" click on the sign-in page: start that connector. The user accepted the
 * return address on the page, so a refusal from here on is an authorization error there, while
 * the card holds it (`toApp`). There is no Cancel: a user who does not continue closes the tab,
 * and the request expires.
 */
export const continueSignIn = Effect.fn("continueSignIn")(function* (request: Request) {
  const broker = yield* BrokerConfig;
  const cookies = txnCookies(broker);
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
  const refuse = (back: Return | undefined, error: string, description: string) =>
    toApp(back, {
      issuer: broker.issuer,
      clearCookie: cookies.clear(request, requestId),
      error,
      description,
    });
  if (stored.status === "completed" || stored.status === "claimed") {
    return errorPage("Sign-in finished", "This sign-in already finished. Return to the app.", 409);
  }
  // The page's link carries the connector, so a user can edit it: only one of the request's set
  // goes on. The page offered no other, so an edited link gets no redirect.
  const name = url.searchParams.get("connector") ?? "";
  const connector = broker.connectorsByName.get(name);
  if (connector === undefined || !stored.connectors.includes(name)) {
    return errorPage("Unknown connector", "That sign-in method is not offered here.", 404);
  }
  const loginAge = loginAgeOn(connector, stored);
  if (loginAge === undefined) {
    return refuse(stored.back, "login_required", freshLoginRefusal);
  }
  return yield* startConnector({ connector, requestId, loginAge, refuse });
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

/** The provider's redirect back to the broker, for one connector. */
export const upstreamCallback = (connector: Connector) =>
  Effect.fn("upstreamCallback")(function* (request: Request) {
    const broker = yield* BrokerConfig;
    const { fetch } = yield* Fetch;
    const cookies = txnCookies(broker);
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (state === null) {
      return errorPage("Invalid callback", "The provider sent no state.", 400);
    }
    const now = yield* Clock.currentTimeMillis;
    const txnCookieHashes: string[] = [];
    for (const cookie of cookies.read(request).values()) {
      txnCookieHashes.push(yield* sha256HexEffect(cookie));
    }
    // The claim reads the card in its own step. The user continued from the page or went
    // straight on, so a refusal from here goes to the return address, once the browser proved
    // it holds the request's cookie and while the card holds the address.
    const claim = yield* command("authRequests.claimUpstream", {
      upstreamStateHash: yield* sha256HexEffect(state),
      connector: connector.name,
      txnCookieHashes,
      configured: broker.configured,
      liveGates: yield* liveGates,
      now,
    });
    if (claim.status === "missing") {
      return errorPage(
        "Sign-in link used",
        "This sign-in link is invalid or was already used. Return to the app and try again.",
        400,
      );
    }
    if (claim.status === "unbound") {
      return unboundPage();
    }
    // Each answer to the app goes to the return address that its own step read on the card.
    const answer = (back: Return | null | undefined, error: string, description: string) =>
      toApp(back ?? undefined, {
        issuer: broker.issuer,
        clearCookie: cookies.clear(request, claim.requestId),
        error,
        description,
      });
    const expired = "The sign-in expired.";
    /** A stop or a change of the card stops the sign-in: to the app, as refused. */
    const stoppedNow = "Sign-in for this app is no longer available.";
    if (claim.status === "expired") {
      return answer(claim.back, "access_denied", expired);
    }
    if (claim.status === "refused") {
      return answer(claim.back, "access_denied", stoppedNow);
    }
    /** Deletes the claimed request, and answers the return address that the deletion read. */
    const abandon = command("authRequests.abandon", { requestId: claim.requestId });
    const finished = yield* Effect.result(
      Effect.tryPromise({
        try: async () => {
          const upstream = await finishUpstream({
            connector,
            callbackUrl: callbackUrl(broker, connector),
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
      const back = yield* abandon;
      // The provider's error code picks one fixed answer; nothing the provider wrote is echoed.
      // The connector's label is free text, so no description holds it (RFC 6749 section
      // 4.1.2.1).
      switch (failure.reason) {
        case "access_denied":
          return answer(back, "access_denied", "The provider sign-in was declined.");
        case "temporarily_unavailable":
          return answer(
            back,
            "temporarily_unavailable",
            "The provider is temporarily unavailable.",
          );
        case "failed":
          // Only the class name: provider errors carry token responses and decoded claims.
          console.error(`Connector "${connector.name}" failed: ${failure.className}`);
          return answer(back, "server_error", "The provider sign-in failed.");
        default:
          return failure.reason satisfies never;
      }
    }
    const upstream = finished.success;
    // Stored with every completed request; the token carries it only for a forced login or a
    // max_age (authRequests.exchangeCode).
    let authTime = now;
    // A connector that can no longer serve the request since its start is held to the strictest
    // check. A plain OAuth connector has no auth_time, and /authorize or /continue refused it.
    const loginAge: LoginAge = loginAgeOn(connector, claim) ?? { kind: "forced" };
    if (loginAge.kind !== "none") {
      // Only the id_token's auth_time attests the login: a provider can reuse its session even
      // after prompt=login. A forced login falls between the request's creation and now, each
      // widened by the clock skew; a positive max_age holds with no tolerance (Keycloak's
      // passMaxAge does the same). auth_time is in whole seconds.
      const { authTimeSeconds } = upstream;
      const nowSeconds = Math.floor(now / 1000);
      if (
        authTimeSeconds === undefined ||
        authTimeSeconds > nowSeconds + AUTH_TIME_SKEW_SECONDS ||
        (loginAge.kind === "forced" &&
          authTimeSeconds < Math.floor(claim.createdAt / 1000) - AUTH_TIME_SKEW_SECONDS) ||
        (claim.maxAge !== undefined && nowSeconds - authTimeSeconds > claim.maxAge)
      ) {
        return answer(
          yield* abandon,
          "login_required",
          loginAge.kind === "forced"
            ? "The provider did not confirm a new login, which prompt=login or max_age asked for."
            : "The provider did not confirm a login within max_age.",
        );
      }
      authTime = authTimeSeconds * 1000;
    }
    // The completion reads the card once more (the provider took time, and a stop or a change of
    // the card may have landed). The provider's code is spent, so whatever fails in here still
    // answers the app, and the request is abandoned when that write goes through.
    return yield* Effect.gen(function* () {
      const code = yield* randomToken(32);
      const completed = yield* command("authRequests.complete", {
        requestId: claim.requestId,
        identity: { connector: connector.name, ...upstream.identity },
        authTime,
        codeHash: yield* sha256HexEffect(code),
        codeExpiresAt: now + CODE_TTL_MS,
        configured: broker.configured,
        liveGates: yield* liveGates,
        now,
      });
      if (!completed.ok) {
        return answer(
          completed.error === "not_found" ? undefined : completed.back,
          "access_denied",
          completed.error === "refused" ? stoppedNow : expired,
        );
      }
      return authorizationResponse({
        redirectUri: completed.back.redirectUri,
        issuer: broker.issuer,
        state: completed.back.state,
        clearCookie: cookies.clear(request, claim.requestId),
        params: { code },
      });
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          console.error(
            `Connector "${connector.name}" completion failed: ${className(Cause.squash(cause))}`,
          );
          // The request stays claimed until it expires when this fails too; nothing can finish
          // it, and no step read the return address.
          const abandoned = yield* Effect.exit(abandon);
          return answer(
            Exit.isSuccess(abandoned) ? abandoned.value : undefined,
            "temporarily_unavailable",
            "Sign-in is not available right now.",
          );
        }),
      ),
    );
  });

export const token = Effect.fn("token")(function* (request: Request) {
  const broker = yield* BrokerConfig;
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
  // The client is authenticated in the step that redeems the code, from its card. The secret, the
  // code and the app's verifier cross the command boundary only as hashes (design section 2.2).
  const exchange = yield* command("authRequests.exchangeCode", {
    clientId: clientAuth.value.clientId,
    clientSecretHash: yield* sha256HexEffect(clientAuth.value.clientSecret),
    tokenEndpointAuthMethod: clientAuth.value.method,
    codeHash: yield* sha256HexEffect(validation.value.code),
    redirectUri: validation.value.redirectUri,
    codeChallengeOfVerifier: yield* s256Challenge(validation.value.codeVerifier),
    ...(resource === undefined ? {} : { resource }),
    configured: broker.configured,
    liveGates: yield* liveGates,
    now,
  });
  if (!exchange.ok) {
    return exchange.error === "invalid_client"
      ? oauthError(401, "invalid_client", exchange.description, challenge)
      : oauthError(400, exchange.error, exchange.description);
  }
  const keys = yield* keySet;
  const connector = broker.connectorsByName.get(exchange.identity.connector);
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
        issuer: broker.issuer,
        clientId: exchange.clientId,
        claims,
        authTime: exchange.authTime,
        nonce: exchange.nonce,
      }),
      signAccessToken({ keySet: keys, issuer: broker.issuer, clientId: exchange.clientId, claims }),
    ]),
  );
  yield* command("signIns.record", {
    clientId: exchange.clientId,
    ref: exchange.ref,
    connector: exchange.identity.connector,
    sub,
    at: now,
  });
  logBrokerEvent({
    event: "sign_in",
    clientId: exchange.clientId,
    ref: exchange.ref,
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
  const broker = yield* BrokerConfig;
  // Only the Authorization header (RFC 6750 section 2.1): a token in the body or query is none.
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (bearer === null) {
    return noToken("userinfo");
  }
  const keys = yield* keySet;
  const verified = yield* Effect.promise(() =>
    verifyAccessToken({ keySet: keys, issuer: broker.issuer, token: bearer }),
  );
  // A deleted card's tokens die with it (RFC 7592 section 2.3). A stop, a removed connector or
  // return address leaves tokens already issued usable until they expire.
  if (
    verified === null ||
    (yield* command("clients.get", { clientId: verified.clientId })) === null
  ) {
    return invalidToken();
  }
  return json(verified.claims);
});
