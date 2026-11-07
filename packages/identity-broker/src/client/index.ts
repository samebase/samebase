import {
  httpActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
  type PublicHttpAction,
} from "convex/server";
import { v } from "convex/values";
import * as oauth from "oauth4webapi";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Connector } from "./connectors/types.js";
import { finishUpstream, startUpstream, type UpstreamFinish } from "./connectors/upstream.js";
import { errorPage, signInPage, type Consent } from "./html.js";
import {
  signAccessToken,
  signIdToken,
  TOKEN_TTL_SECONDS,
  verifyAccessToken,
  type IdentityClaims,
} from "./jwt.js";
import { parseKeySet, publicJwks, SIGNING_ALGORITHM, type KeySet } from "./keys.js";
import {
  isSecureUrl,
  readBearerToken,
  readClientAuthentication,
  validateAuthorizeRest,
  validateAuthorizeTarget,
  validateTokenRequest,
} from "./protocol.js";
import {
  authorizationError,
  authorizationResponse,
  json,
  oauthError,
  readParameters,
  redirect,
} from "./responses.js";
import { hubClientsEndpoint, LOOPBACK_HOSTS } from "./hubClients.js";
import { moderationEndpoints } from "./moderation.js";
import { decide, pageShown, policyArg, type Decision, type Registration } from "./policy.js";
import {
  newClientCredentials,
  registrationEndpoints,
  type RegistrationConfig,
} from "./registration.js";
import { randomToken, sha256Hex } from "./subject.js";
import { resourceEndpoints, resourceTokenResponse } from "./resources.js";
import type { ResourceProvider } from "./resourceProviders.js";

export type {
  Connector,
  OauthConnector,
  OidcConnector,
  UpstreamIdentity,
} from "./connectors/types.js";
export { github } from "./connectors/github.js";
export { google } from "./connectors/google.js";
export {
  convexConnection,
  cloudflareConnection,
  githubConnection,
  type ResourceProvider,
} from "./resourceProviders.js";
export { createKeySet, parseKeySet, rotateKeySet, type KeySet } from "./keys.js";
export { assertKeySetUsable } from "./jwt.js";
export type { Policy, Registration } from "./policy.js";
export type { RegistrationConfig } from "./registration.js";

export type IdentityBrokerConfig = {
  /** `components.identityBroker` of the host app. */
  component: ComponentApi;
  /**
   * The issuer URL. Supported: a dedicated hostname with the issuer at `/`, e.g.
   * `https://auth.example.com`, where the transaction cookies carry the `__Host-` prefix. An issuer
   * under a path uses plain cookies and is not verified in browsers.
   */
  issuer: string;
  /** The content of `IDENTITY_BROKER_KEYS`, read in the request. */
  keys: () => string | undefined;
  /** The connectors a client may enroll in. A hub's policy decides which ones each client gets. */
  connectors: Connector[];
  /**
   * OAuth API resources. In hub mode the policy's `resources` names the providers a client may
   * authorize; without hub mode every client may authorize every one.
   */
  resources?: ResourceProvider[];
  /**
   * Days without a sign-in after which `cleanup` deletes a preview client. Absent: `cleanup` deletes
   * no client, because a deployment whose client was deleted does not register again by itself.
   */
  previewClientIdleDays?: number;
  /**
   * The hub mode: `POST /hub-clients`, `/register/<client>` (RFC 7592), `/moderation/*`, and the
   * policy. Absent: none of these endpoints, and the host is its own policy.
   */
  registration?: RegistrationConfig;
};

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

type Ctx = GenericActionCtx<GenericDataModel>;

export function defineIdentityBroker(config: IdentityBrokerConfig) {
  const issuerUrl = new URL(config.issuer);
  if (!isSecureUrl(issuerUrl)) {
    throw new Error("The issuer must be https, or http on a loopback host for local development");
  }
  if (issuerUrl.search !== "" || issuerUrl.hash !== "") {
    throw new Error("The issuer must not have a query or fragment");
  }
  const issuer = issuerUrl.href.replace(/\/$/, "");
  const prefix = issuerUrl.pathname.replace(/\/$/, "");
  const path = (suffix: string) => `${prefix}${suffix}`;
  /**
   * `/authorize` binds each request to the browser that started it (RFC 9700 section 2.1.1) with one
   * cookie per request, named after the request id, so two sign-ins in one browser keep their own.
   * `__Host-` needs Path=/, so a path issuer uses a plain name scoped to its path.
   */
  const txnCookiePrefix = prefix === "" ? "__Host-broker_txn_" : "broker_txn_";
  const txnCookieAttributes = `Path=${prefix === "" ? "/" : prefix}; HttpOnly; Secure; SameSite=Lax`;
  const component = config.component;
  const connectors = new Map(config.connectors.map((connector) => [connector.name, connector]));
  if (connectors.size !== config.connectors.length) {
    throw new Error("Connector names must be unique");
  }
  if (connectors.size === 0) {
    throw new Error("At least one connector is required");
  }
  // A provider is the first part of every `sub` its connectors make, so it holds no colon, and its
  // connectors sign in the accounts of one issuer: another issuer could reuse an upstream id.
  const providerIssuers = new Map<string, string>();
  for (const connector of config.connectors) {
    if (!/^[a-z0-9-]+$/.test(connector.provider)) {
      throw new Error(`Connector "${connector.name}" has a provider that is not [a-z0-9-]+`);
    }
    const issuerOfProvider = providerIssuers.get(connector.provider) ?? connector.issuer;
    if (issuerOfProvider !== connector.issuer) {
      throw new Error(`The connectors of provider "${connector.provider}" have two issuers`);
    }
    providerIssuers.set(connector.provider, connector.issuer);
  }
  const { previewClientIdleDays, registration } = config;
  const providers = config.resources ?? [];
  /** The hub's privacy notice and terms, under its sign-in page. */
  const legal =
    registration === undefined
      ? null
      : { privacy: registration.privacy, terms: registration.terms };
  // Zero or less would delete every preview client at the next cleanup.
  if (previewClientIdleDays !== undefined && !(previewClientIdleDays > 0)) {
    throw new Error("previewClientIdleDays must be a positive number of days");
  }

  /** The decision for a client at this request; null when the policy refused it (see `decide`). */
  const decideFor = (found: {
    client: { connectors: string[] };
    registration: Registration | null;
  }): Decision | null =>
    decide({
      policy: registration?.policy,
      registration: found.registration,
      enrollment: found.client.connectors,
      providers,
    });

  /** The configured connectors of these names, in this order. A name no longer configured is skipped. */
  const connectorsNamed = (names: string[]): Connector[] =>
    names.flatMap((name) => {
      const connector = connectors.get(name);
      return connector === undefined ? [] : [connector];
    });

  /** The transaction cookies the browser sent, by request id. */
  function readTxnCookies(request: Request): Map<string, string> {
    const cookies = new Map<string, string>();
    for (const pair of request.headers.get("cookie")?.split(";") ?? []) {
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      if (separator > 0 && name.startsWith(txnCookiePrefix)) {
        cookies.set(name.slice(txnCookiePrefix.length), pair.slice(separator + 1).trim());
      }
    }
    return cookies;
  }

  /** Whether the browser holds the cookie whose hash the request stores. */
  async function browserBound(
    request: Request,
    stored: { requestId: string; txnCookieHash: string },
  ): Promise<boolean> {
    const cookie = readTxnCookies(request).get(stored.requestId);
    return cookie !== undefined && (await sha256Hex(cookie)) === stored.txnCookieHash;
  }

  /** The Set-Cookie value that deletes a request's cookie, when the browser sent one. */
  function clearTxnCookie(request: Request, requestId: string): string | undefined {
    return readTxnCookies(request).has(requestId)
      ? `${txnCookiePrefix}${requestId}=; ${txnCookieAttributes}; Max-Age=0`
      : undefined;
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

  const keySet = (): KeySet => parseKeySet(config.keys());
  const callbackUrl = (connector: Connector) => `${issuer}/connectors/${connector.name}/callback`;
  const resources = resourceEndpoints({
    component,
    issuer,
    path,
    providers,
    decide: decideFor,
    cookies: {
      prefix: txnCookiePrefix,
      attributes: txnCookieAttributes,
      read: readTxnCookies,
      clear: clearTxnCookie,
    },
  });

  const metadata = () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    scopes_supported: [...SCOPES, ...resources.scopes],
    // An extension: the names a registration may enroll in. What a client may use is in its
    // registration answer.
    connectors_supported: [...connectors.keys()],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: resources.enabled
      ? ["authorization_code", "refresh_token"]
      : ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [SIGNING_ALGORITHM],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    ...(resources.enabled
      ? {
          revocation_endpoint: `${issuer}/revoke`,
          revocation_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        }
      : {}),
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
  });

  const discovery = httpActionGeneric(async () =>
    json(metadata(), 200, { "Cache-Control": "public, max-age=300" }),
  );

  const jwks = httpActionGeneric(async () =>
    json(publicJwks(keySet()), 200, { "Cache-Control": "public, max-age=300" }),
  );

  /**
   * Freshness is honored only as prompt=login upstream: a plain OAuth connector, or an OIDC
   * connector whose provider documents no `login` value, is refused, never pretended.
   */
  const cannotReauthenticate = (connector: Connector) =>
    connector.kind === "oauth" || !connector.promptLogin;
  const freshLoginRefusal = (connector: Connector) =>
    `${connector.label} cannot reauthenticate the user, which prompt=login or max_age asked for.`;

  /**
   * Sends the user to a connector for a stored request. `refuse` answers a refusal: the hub's
   * error page from `/authorize`, where the user has not continued, and the authorization error
   * at the return address from `/continue`, where the user has.
   */
  async function startConnector(
    ctx: Ctx,
    args: {
      connector: Connector;
      request: { requestId: string; freshLogin: boolean };
      decision: Decision;
      refuse: (error: string, description: string) => Response;
    },
  ): Promise<Response> {
    const { connector, request } = args;
    if (request.freshLogin && cannotReauthenticate(connector)) {
      return args.refuse("login_required", freshLoginRefusal(connector));
    }
    const start = await startUpstream({
      connector,
      callbackUrl: callbackUrl(connector),
      freshLogin: request.freshLogin,
    });
    const now = Date.now();
    const result = await ctx.runMutation(component.authRequests.startUpstream, {
      requestId: request.requestId,
      connector: connector.name,
      upstreamStateHash: await sha256Hex(start.state),
      upstreamCodeVerifier: start.codeVerifier,
      ...(start.nonce === undefined ? {} : { upstreamNonce: start.nonce }),
      policy: policyArg(args.decision),
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
  }

  const continueHref = (requestId: string, connector: Connector) =>
    `${path("/continue")}?request=${encodeURIComponent(requestId)}&connector=${encodeURIComponent(connector.name)}`;

  /**
   * What a hub's sign-in page names when it asks for consent: the deploy and the repository from
   * the client's facts, which the hub checked (RFC 7591 section 5).
   */
  function consentOf(
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
      reviewer: registration?.name ?? new URL(issuer).host,
    };
  }

  const authorize = httpActionGeneric(async (ctx, request) => {
    const params = await readParameters(request);
    if (params === null) {
      return oauthError(
        415,
        "invalid_request",
        "A POST must be application/x-www-form-urlencoded.",
      );
    }
    const target = validateAuthorizeTarget(params);
    if (!target.ok) {
      return errorPage("Invalid sign-in request", target.description, target.status);
    }
    const found = await ctx.runQuery(component.clients.forAuthorize, {
      clientId: target.value.clientId,
    });
    if (found === null) {
      return errorPage(
        "Unknown client",
        "The client_id is not registered with this provider.",
        400,
      );
    }
    const { client, app } = found;
    // Exact string comparison, and no redirect to a URI that is not registered (RFC 9700 4.1.3).
    if (client.redirectUri !== target.value.redirectUri) {
      return errorPage(
        "Invalid redirect URI",
        "The redirect_uri is not the one registered for this client.",
        400,
      );
    }
    if (params.has("resource")) return await resources.authorize(ctx, params, found);
    const rest = validateAuthorizeRest(params, target.value);
    if (!rest.ok) {
      return refusePage(rest.description);
    }
    if (app === null) {
      return errorPage("Sign-in unavailable", "The client's app is gone.", 400);
    }
    if (app.suspended) {
      return offPage();
    }
    const decision = decideFor(found);
    if (decision === null) {
      return unavailablePage();
    }
    if (decision.paused) {
      return pausedPage();
    }
    if (rest.value.prompt.includes("none")) {
      // The broker keeps no session, so it can never answer without interaction.
      return refusePage("This provider has no session to reuse.");
    }
    const freshLogin = rest.value.prompt.includes("login") || rest.value.maxAge !== undefined;
    const scopes = SCOPES.filter((scope) => rest.value.scopes.includes(scope));
    // The set of the request: the connectors the app named, else every one the client may use
    // now. A name outside the enrollment is a request error; an enrolled one that the policy no
    // longer allows is not offered, and a set with none left is a stopped sign-in.
    const named = rest.value.connectors;
    const notEnrolled = named.find((name) => !client.connectors.includes(name));
    if (notEnrolled !== undefined) {
      return refusePage(`This client is not enrolled in the connector "${notEnrolled}".`);
    }
    const offered = connectorsNamed(
      named.length === 0
        ? decision.connectors
        : named.filter((name) => decision.connectors.includes(name)),
    );
    if (offered.length === 0) {
      return offPage();
    }
    // The facts the page names when it asks: a hub asks unless an exemption of its administrator
    // covers the client (`pageShown`). Decided here only, on this snapshot. Without hub mode, no
    // page asks.
    const consent =
      registration !== undefined && found.registration !== null && pageShown(found.exemption)
        ? found.registration
        : null;
    // One offered connector and no consent to ask: straight to it (decision 5 of RFC 137). A fresh
    // login that the connector cannot do is refused here, before anything is stored.
    const direct = offered.length === 1 && consent === null ? offered[0] : undefined;
    if (direct !== undefined && freshLogin && cannotReauthenticate(direct)) {
      return refusePage(freshLoginRefusal(direct));
    }
    // Every later step needs this cookie: a client that fetches the page itself cannot send a
    // user's browser on from it, and a provider callback finishes only where the sign-in started.
    const txnCookie = randomToken(32);
    const now = Date.now();
    const requestId = randomToken(24);
    const created = await ctx.runMutation(component.authRequests.create, {
      tenantId: app.tenantId,
      requestId,
      appId: app.appId,
      clientId: client.clientId,
      redirectUri: client.redirectUri,
      scope: scopes.join(" "),
      ...(rest.value.state === undefined ? {} : { state: rest.value.state }),
      ...(rest.value.nonce === undefined ? {} : { nonce: rest.value.nonce }),
      codeChallenge: rest.value.codeChallenge,
      connectors: offered.map((connector) => connector.name),
      freshLogin,
      txnCookieHash: await sha256Hex(txnCookie),
      createdAt: now,
      expiresAt: now + AUTH_REQUEST_TTL_MS,
    });
    if (!created.ok) {
      switch (created.error) {
        case "rate_limited":
          return errorPage(
            "Too many sign-ins",
            "Too many sign-ins for this app. Try again soon.",
            429,
          );
        case "suspended":
          return offPage();
        default:
          return created.error satisfies never;
      }
    }
    const setCookie = `${txnCookiePrefix}${requestId}=${txnCookie}; ${txnCookieAttributes}; Max-Age=${AUTH_REQUEST_TTL_MS / 1000}`;
    if (direct !== undefined) {
      const response = await startConnector(ctx, {
        connector: direct,
        request: { requestId, freshLogin },
        decision,
        refuse: (_error, description) => refusePage(description),
      });
      response.headers.append("Set-Cookie", setCookie);
      return response;
    }
    const redirectUrl = new URL(client.redirectUri);
    const page = signInPage({
      host: redirectUrl.host,
      origin: redirectUrl.origin,
      consent:
        consent === null
          ? null
          : consentOf(consent, client, scopes, LOOPBACK_HOSTS.has(redirectUrl.hostname)),
      connectors: offered.map((connector) => ({
        label: connector.label,
        provider: connector.provider,
        href: continueHref(requestId, connector),
      })),
      legal,
    });
    page.headers.append("Set-Cookie", setCookie);
    return page;
  });

  /**
   * A "Continue with" click on the sign-in page: start that connector. The user accepted the
   * return address on the page, so a refusal from here on is an authorization error there. There
   * is no Cancel: a user who does not continue closes the tab, and the request expires.
   */
  const continueSignIn = httpActionGeneric(async (ctx, request) => {
    const url = new URL(request.url);
    const requestId = url.searchParams.get("request") ?? "";
    const stored = await ctx.runQuery(component.authRequests.get, { requestId });
    if (stored === null) {
      return errorPage(
        "Sign-in not found",
        "This sign-in is unknown or finished. Return to the app and try again.",
        404,
      );
    }
    if (!(await browserBound(request, stored))) {
      return unboundPage();
    }
    const back = {
      redirectUri: stored.redirectUri,
      issuer,
      state: stored.state,
      clearCookie: clearTxnCookie(request, requestId),
    };
    const refuse = (error: string, description: string) =>
      authorizationError({ ...back, error, description });
    if (stored.status === "completed" || stored.status === "claimed") {
      return errorPage(
        "Sign-in finished",
        "This sign-in already finished. Return to the app.",
        409,
      );
    }
    // The page's link carries the connector, so a user can edit it: only one of the request's set
    // goes on. The page offered no other, so an edited link gets no redirect.
    const name = url.searchParams.get("connector") ?? "";
    const connector = connectors.get(name);
    if (connector === undefined || !stored.connectors.includes(name)) {
      return errorPage("Unknown connector", "That sign-in method is not offered here.", 404);
    }
    const found = await ctx.runQuery(component.clients.withApp, { clientId: stored.clientId });
    if (found === null || found.app === null) {
      return refuse("server_error", "The client's app is gone.");
    }
    if (found.app.suspended) {
      return refuse("access_denied", "Sign-in for this app is turned off.");
    }
    const decision = decideFor(found);
    if (decision === null) {
      return refuse("temporarily_unavailable", "Sign-in is not available right now.");
    }
    if (decision.paused) {
      return refuse("temporarily_unavailable", "Sign-in is paused.");
    }
    if (!decision.connectors.includes(name)) {
      return refuse("access_denied", "That sign-in method is no longer available.");
    }
    return await startConnector(ctx, {
      connector,
      request: { requestId, freshLogin: stored.freshLogin },
      decision,
      refuse,
    });
  });

  function upstreamCallback(connector: Connector): PublicHttpAction {
    return httpActionGeneric(async (ctx, request) => {
      const url = new URL(request.url);
      const state = url.searchParams.get("state");
      if (state === null) {
        return errorPage("Invalid callback", "The provider sent no state.", 400);
      }
      const now = Date.now();
      const upstreamStateHash = await sha256Hex(state);
      const linkUsedPage = () =>
        errorPage(
          "Sign-in link used",
          "This sign-in link is invalid or was already used. Return to the app and try again.",
          400,
        );
      // The waiting request and its client, read before the claim: the user continued from the
      // page or went straight on, so a refusal from here goes to the return address, once the
      // browser proves it holds the request's cookie. A failed policy writes nothing.
      const waiting = await ctx.runQuery(component.authRequests.upstreamClient, {
        upstreamStateHash,
      });
      if (waiting === null) {
        return linkUsedPage();
      }
      if (!(await browserBound(request, waiting.request))) {
        return unboundPage();
      }
      const back = {
        redirectUri: waiting.request.redirectUri,
        issuer,
        state: waiting.request.state,
        clearCookie: clearTxnCookie(request, waiting.request.requestId),
      };
      const found = waiting.client;
      if (found === null || found.app === null) {
        await ctx.runMutation(component.authRequests.abandon, {
          requestId: waiting.request.requestId,
        });
        return authorizationError({
          ...back,
          error: "server_error",
          description: "The client's app is gone.",
        });
      }
      const decision = decideFor(found);
      if (decision === null) {
        return authorizationError({
          ...back,
          error: "temporarily_unavailable",
          description: "Sign-in is not available right now.",
        });
      }
      const claim = await ctx.runMutation(component.authRequests.claimUpstream, {
        upstreamStateHash,
        connector: connector.name,
        txnCookieHashes: await Promise.all(
          [...readTxnCookies(request).values()].map((cookie) => sha256Hex(cookie)),
        ),
        policy: policyArg(decision),
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
      let upstream: UpstreamFinish;
      try {
        upstream = await finishUpstream({
          connector,
          callbackUrl: callbackUrl(connector),
          currentUrl: url,
          state,
          codeVerifier: claim.upstreamCodeVerifier,
          nonce: claim.upstreamNonce,
        });
      } catch (error) {
        await ctx.runMutation(component.authRequests.abandon, { requestId: claim.requestId });
        // The provider's error code picks one fixed answer; nothing the provider wrote is echoed.
        if (error instanceof oauth.AuthorizationResponseError && error.error === "access_denied") {
          return authorizationError({
            ...back,
            error: "access_denied",
            description: `${connector.label} sign-in was declined.`,
          });
        }
        if (
          error instanceof oauth.AuthorizationResponseError &&
          error.error === "temporarily_unavailable"
        ) {
          return authorizationError({
            ...back,
            error: "temporarily_unavailable",
            description: `${connector.label} is temporarily unavailable.`,
          });
        }
        // Only the class name: provider errors carry token responses and decoded claims.
        console.error(
          `Connector "${connector.name}" failed: ${error instanceof Error ? error.constructor.name : typeof error}`,
        );
        return authorizationError({
          ...back,
          error: "server_error",
          description: `${connector.label} sign-in failed.`,
        });
      }
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
          await ctx.runMutation(component.authRequests.abandon, { requestId: claim.requestId });
          return authorizationError({
            ...back,
            error: "login_required",
            description: `${connector.label} did not confirm a new login, which prompt=login or max_age asked for.`,
          });
        }
        authTime = authTimeSeconds * 1000;
      }
      // The completion: the decision again, on the rows as they are now (the provider took time,
      // and a block, a transfer, or a policy change may have landed), then the mutation, which
      // reads those rows once more. The provider's code is spent, so whatever fails in here still
      // answers the app, and the request is abandoned when that write goes through.
      const unavailable = () =>
        authorizationError({
          ...back,
          error: "temporarily_unavailable",
          description: "Sign-in is not available right now.",
        });
      try {
        const current = await ctx.runQuery(component.clients.withApp, {
          clientId: found.client.clientId,
        });
        const completion = current === null ? null : decideFor(current);
        if (completion === null) {
          await ctx.runMutation(component.authRequests.abandon, { requestId: claim.requestId });
          return unavailable();
        }
        const code = randomToken(32);
        const completed = await ctx.runMutation(component.authRequests.complete, {
          requestId: claim.requestId,
          identity: { connector: connector.name, ...upstream.identity },
          authTime,
          codeHash: await sha256Hex(code),
          codeExpiresAt: now + CODE_TTL_MS,
          policy: policyArg(completion),
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
      } catch (error) {
        console.error(
          `Connector "${connector.name}" completion failed: ${error instanceof Error ? error.constructor.name : typeof error}`,
        );
        try {
          await ctx.runMutation(component.authRequests.abandon, { requestId: claim.requestId });
        } catch {
          // The request stays claimed until it expires; nothing can finish it.
        }
        return unavailable();
      }
    });
  }

  const token = httpActionGeneric(async (ctx, request) => {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/x-www-form-urlencoded")) {
      return oauthError(
        415,
        "invalid_request",
        "The body must be application/x-www-form-urlencoded.",
      );
    }
    const params = new URLSearchParams(await request.text());
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
    if (params.get("grant_type") === "refresh_token" && resources.enabled) {
      return await resources.refresh(ctx, params, clientAuth.value);
    }
    if (params.getAll("resource").length > 1)
      return oauthError(400, "invalid_target", "Request one API resource.");
    const validation = validateTokenRequest(params, clientAuth.value);
    if (!validation.ok) {
      return oauthError(validation.status, validation.error, validation.description);
    }
    const now = Date.now();
    const refreshToken = randomToken(32);
    const resource = params.get("resource") ?? undefined;
    // The policy is decided on the client's rows of this moment; the mutation checks them again.
    const found = await ctx.runQuery(component.clients.withApp, {
      clientId: clientAuth.value.clientId,
    });
    if (found === null) {
      return oauthError(401, "invalid_client", "Client authentication failed.", challenge);
    }
    const decision = decideFor(found);
    if (decision === null) {
      return oauthError(503, "temporarily_unavailable", "Sign-in is not available right now.");
    }
    // The client is authenticated in the transaction that redeems the code.
    const exchange = await ctx.runMutation(component.authRequests.exchangeCode, {
      clientId: clientAuth.value.clientId,
      clientSecretHash: await sha256Hex(clientAuth.value.clientSecret),
      tokenEndpointAuthMethod: clientAuth.value.method,
      codeHash: await sha256Hex(validation.value.code),
      ...(validation.value.redirectUri === undefined
        ? {}
        : { redirectUri: validation.value.redirectUri }),
      codeVerifier: validation.value.codeVerifier,
      ...(resource === undefined ? {} : { resource }),
      refreshTokenHash: await sha256Hex(refreshToken),
      policy: policyArg(decision),
      now,
    });
    if (!exchange.ok) {
      return exchange.error === "invalid_client"
        ? oauthError(401, "invalid_client", exchange.description, challenge)
        : oauthError(400, exchange.error, exchange.description);
    }
    if ("kind" in exchange) {
      return resourceTokenResponse(exchange, exchange.refresh ? refreshToken : undefined);
    }
    const keys = keySet();
    const connector = connectors.get(exchange.identity.connector);
    if (connector === undefined) {
      throw new Error(`The connector "${exchange.identity.connector}" of a sign-in is gone`);
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
    const [idToken, accessToken] = await Promise.all([
      signIdToken({
        keySet: keys,
        issuer,
        clientId: exchange.clientId,
        claims,
        authTime: exchange.authTime,
        nonce: exchange.nonce,
      }),
      signAccessToken({ keySet: keys, issuer, clientId: exchange.clientId, claims }),
    ]);
    await ctx.runMutation(component.signIns.record, {
      appId: exchange.appId,
      clientId: exchange.clientId,
      connector: exchange.identity.connector,
      sub,
      at: now,
    });
    return json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SECONDS,
      id_token: idToken,
      scope: exchange.scope,
    });
  });

  const userinfo = httpActionGeneric(async (_ctx, request) => {
    const bearer = readBearerToken(request.headers.get("authorization"));
    const claims =
      bearer === null ? null : await verifyAccessToken({ keySet: keySet(), issuer, token: bearer });
    if (claims === null) {
      return json(
        {
          error: "invalid_token",
          error_description: "The access token is missing, invalid or expired.",
        },
        401,
        {
          "WWW-Authenticate": 'Bearer error="invalid_token"',
        },
      );
    }
    return json(claims);
  });

  return {
    /** Mounts every endpoint on the host's router. */
    addHttpRoutes(http: HttpRouter): void {
      http.route({
        path: path("/.well-known/openid-configuration"),
        method: "GET",
        handler: discovery,
      });
      http.route({
        path: `/.well-known/oauth-authorization-server${prefix}`,
        method: "GET",
        handler: discovery,
      });
      http.route({ path: path("/.well-known/jwks.json"), method: "GET", handler: jwks });
      http.route({ path: path("/authorize"), method: "GET", handler: authorize });
      http.route({ path: path("/authorize"), method: "POST", handler: authorize });
      http.route({ path: path("/continue"), method: "GET", handler: continueSignIn });
      http.route({ path: path("/token"), method: "POST", handler: token });
      http.route({ path: path("/userinfo"), method: "GET", handler: userinfo });
      http.route({ path: path("/userinfo"), method: "POST", handler: userinfo });
      resources.addRoutes(http);
      for (const connector of connectors.values()) {
        http.route({
          path: path(`/connectors/${connector.name}/callback`),
          method: "GET",
          handler: upstreamCallback(connector),
        });
      }
      if (registration !== undefined) {
        registrationEndpoints({ component, issuer, path }).addRoutes(http);
        http.route({
          path: path("/hub-clients"),
          method: "POST",
          handler: hubClientsEndpoint({
            component,
            issuer,
            registration,
            connectors: [...connectors.keys()],
          }),
        });
        moderationEndpoints({ component, registration, path }).addRoutes(http);
      }
    },

    /**
     * The credentials of a client for `component.registration.register`, for a host that proves its
     * callers in another way than `POST /hub-clients`. Call it in an action: the secret and the
     * registration access token go to the caller of the host's endpoint, and nowhere else.
     */
    newClientCredentials: async () => await newClientCredentials(issuer),

    /**
     * Administration as internal functions of the host, for `npx convex run`: export them from a
     * host module such as `convex/identityBroker.ts`.
     */
    admin() {
      const { string } = v;
      return {
        deleteClient: internalMutationGeneric({
          args: { clientId: string() },
          returns: v.null(),
          handler: async (ctx, args) => {
            await ctx.runMutation(component.clients.remove, { clientId: args.clientId });
            return null;
          },
        }),
        deleteApp: internalMutationGeneric({
          args: { appId: string() },
          returns: v.null(),
          handler: async (ctx, args) => {
            await ctx.runMutation(component.apps.remove, { appId: args.appId });
            return null;
          },
        }),
        listApps: internalQueryGeneric({
          args: {},
          handler: async (ctx) => await ctx.runQuery(component.apps.list, {}),
        }),
        listClients: internalQueryGeneric({
          args: { appId: string() },
          handler: async (ctx, args) =>
            await ctx.runQuery(component.clients.listByApp, { appId: args.appId }),
        }),
        cleanup: internalMutationGeneric({
          args: {},
          handler: async (ctx) =>
            await ctx.runMutation(component.lifecycle.cleanup, {
              now: Date.now(),
              ...(previewClientIdleDays === undefined
                ? {}
                : { previewClientMaxAgeMs: previewClientIdleDays * 24 * 60 * 60 * 1000 }),
              signInRetentionMs: SIGN_IN_RETENTION_MS,
            }),
        }),
      };
    },
  };
}
